import type { WinEvent } from '../../modules/security/shared/types';
import type { ParsedCommandExecution } from '../../modules/powershell/shared/parsePSEvent';
import type { ParsedProcessCreate } from '../../modules/sysmon/shared/types';
import { parseCommandExecution } from '../../modules/powershell/shared/parsePSEvent';
import { parseProcessCreate } from '../../modules/sysmon/shared/parseSysmonEvent';
import { getSystemField } from '../eventParsing';

const MAX_PROCESS_LOOKBACK_MS = 12 * 60 * 60_000;
const MAX_CLOCK_SKEW_MS = 5_000;
const MAX_POWERSHELL_CONTEXT_WINDOW_MS = 30 * 60_000;

export interface SysmonProcessMatch {
  event: WinEvent;
  parsed: ParsedProcessCreate;
  timeMs: number;
}

export interface PowerShellCommandMatch {
  event: WinEvent;
  parsed: ParsedCommandExecution;
  timeMs: number;
}

export type SysmonProcessIndex = Map<string, SysmonProcessMatch[]>;
export type PowerShellCommandIndex = Map<string, PowerShellCommandMatch[]>;

export function getPowerShellPid(event: WinEvent): number | null {
  if (typeof event.pid === 'number' && event.pid > 0) return event.pid;

  const pidText = getSystemField(event, 'Execution_ProcessID');
  const pid = Number.parseInt(pidText, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

export function buildSysmonProcessIndex(events: WinEvent[]): SysmonProcessIndex {
  const index: SysmonProcessIndex = new Map();

  for (const event of events) {
    if (event.logName !== 'Microsoft-Windows-Sysmon/Operational' || event.eventId !== 1) continue;

    const parsed = parseProcessCreate(event);
    if (!parsed?.processId) continue;

    const timeMs = Date.parse(event.timeCreated);
    if (Number.isNaN(timeMs)) continue;

    const key = `${event.machineName}:${parsed.processId}`;
    const existing = index.get(key);
    const match: SysmonProcessMatch = { event, parsed, timeMs };

    if (existing) existing.push(match);
    else index.set(key, [match]);
  }

  for (const matches of index.values()) {
    matches.sort((a, b) => a.timeMs - b.timeMs);
  }

  return index;
}

export function buildPowerShellCommandIndex(events: WinEvent[]): PowerShellCommandIndex {
  const index: PowerShellCommandIndex = new Map();

  for (const event of events) {
    if (event.logName !== 'Microsoft-Windows-PowerShell/Operational' || event.eventId !== 4103) continue;

    const pid = getPowerShellPid(event);
    if (!pid) continue;

    const parsed = parseCommandExecution(event);
    if (!parsed) continue;

    const timeMs = Date.parse(event.timeCreated);
    if (Number.isNaN(timeMs)) continue;

    const key = `${event.machineName}:${pid}`;
    const existing = index.get(key);
    const match: PowerShellCommandMatch = { event, parsed, timeMs };

    if (existing) existing.push(match);
    else index.set(key, [match]);
  }

  for (const matches of index.values()) {
    matches.sort((a, b) => a.timeMs - b.timeMs);
  }

  return index;
}

export function correlatePowerShellToSysmon(
  event: WinEvent,
  index: SysmonProcessIndex,
): SysmonProcessMatch | null {
  const pid = getPowerShellPid(event);
  if (!pid) return null;

  const eventTimeMs = Date.parse(event.timeCreated);
  if (Number.isNaN(eventTimeMs)) return null;

  const matches = index.get(`${event.machineName}:${pid}`);
  if (!matches || matches.length === 0) return null;

  // PID reuse is common on busy Windows hosts. Prefer the nearest prior
  // Sysmon process creation for the same machine+pid and cap the age.
  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = matches[i];
    const deltaMs = eventTimeMs - candidate.timeMs;

    if (deltaMs < -MAX_CLOCK_SKEW_MS) continue;
    if (deltaMs > MAX_PROCESS_LOOKBACK_MS) break;

    return candidate;
  }

  return null;
}

export function correlatePowerShellToCommandContext(
  event: WinEvent,
  index: PowerShellCommandIndex,
): PowerShellCommandMatch | null {
  const pid = getPowerShellPid(event);
  if (!pid) return null;

  const eventTimeMs = Date.parse(event.timeCreated);
  if (Number.isNaN(eventTimeMs)) return null;

  const matches = index.get(`${event.machineName}:${pid}`);
  if (!matches || matches.length === 0) return null;

  let bestMatch: PowerShellCommandMatch | null = null;
  let bestDeltaMs = Number.POSITIVE_INFINITY;

  for (const candidate of matches) {
    if (candidate.event.id === event.id) continue;

    const deltaMs = Math.abs(eventTimeMs - candidate.timeMs);
    if (deltaMs > MAX_POWERSHELL_CONTEXT_WINDOW_MS) continue;
    if (deltaMs >= bestDeltaMs) continue;

    bestMatch = candidate;
    bestDeltaMs = deltaMs;
  }

  return bestMatch;
}
