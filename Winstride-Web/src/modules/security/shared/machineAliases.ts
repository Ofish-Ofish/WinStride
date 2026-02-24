import type { WinEvent } from './types';
import { getDataField, getDataArray } from '../../../shared/eventParsing';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Maps lowercase raw machine name → canonical display name */
export type MachineAliasMap = Record<string, string>;

/** A single auto-detected alias with the evidence behind it */
export interface DetectedAlias {
  rawName: string;
  canonicalName: string;
  method: 'sid' | 'machine-account' | 'local-logon' | 'fqdn';
  detail: string; // human-readable: e.g. "SID S-1-5-21-…" or "account KIOSK-3$"
}

/** Result of auto-detection — aliases to apply + transparency info */
export interface AutoAliasResult {
  aliases: MachineAliasMap;
  detected: DetectedAlias[];
}

/* ------------------------------------------------------------------ */
/*  localStorage persistence (user overrides only)                     */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'winstride:machineAliases';

export function loadMachineAliases(): MachineAliasMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as MachineAliasMap;
  } catch {
    return {};
  }
}

export function saveMachineAliases(aliases: MachineAliasMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
  } catch { /* quota / private mode */ }
}

/* ------------------------------------------------------------------ */
/*  Name resolution                                                    */
/* ------------------------------------------------------------------ */

/** Strip FQDN domain suffix: "KIOSK-3.chefops.com" → "KIOSK-3" (preserves casing) */
function stripFqdn(name: string): string {
  const dot = name.indexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Resolve a machine name through the alias map + FQDN stripping.
 * Order: explicit alias lookup → FQDN alias lookup → FQDN strip → original name.
 */
export function resolveMachineName(name: string, aliases: MachineAliasMap): string {
  // 1. Direct alias match (exact lowercase)
  const directAlias = aliases[name.toLowerCase()];
  if (directAlias) return directAlias;

  // 2. Strip FQDN, then check alias for the short name
  const short = stripFqdn(name);
  if (short.toLowerCase() !== name.toLowerCase()) {
    const shortAlias = aliases[short.toLowerCase()];
    if (shortAlias) return shortAlias;
    // No alias for short name either — just use the short name (auto-dedup FQDN)
    return short;
  }

  return name;
}

/* ------------------------------------------------------------------ */
/*  Auto-detection: identity-based machine correlation                 */
/* ------------------------------------------------------------------ */

/** Local logon types where WorkstationName = same machine as System.Computer */
const LOCAL_LOGON_TYPES = new Set([2, 7, 11]); // Interactive, Unlock, CachedInteractive

/* ---- Union-Find for equivalence classes ---- */

function createUnionFind() {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!); // path compression
      x = parent.get(x)!;
    }
    return x;
  }

  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  function groups(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const key of parent.keys()) {
      const root = find(key);
      if (!result.has(root)) result.set(root, []);
      result.get(root)!.push(key);
    }
    return result;
  }

  return { find, union, groups };
}

/**
 * Analyze events to find machine names that refer to the same physical
 * computer, using identity signals from the event data itself.
 *
 * Strategies (highest confidence first):
 *
 * 1. **SID-based**: Machine account SIDs (SubjectUserSid when SubjectUserName
 *    ends with "$") are unique per AD computer. If the same domain SID appears
 *    on events with different System.Computer values, they're the same machine.
 *
 * 2. **Machine account name**: If SubjectUserName=KIOSK-3$ appears on events
 *    from WIN-P9BH8VOHHKG, and KIOSK-3 also appears as a System.Computer,
 *    they're the same machine.
 *
 * 3. **Local logon WorkstationName**: For Interactive/Unlock/CachedInteractive
 *    logons, WorkstationName is the source machine. On local logons this IS the
 *    same machine as System.Computer.
 *
 * FQDN normalization ("kiosk-3.chefops.com" → "kiosk-3") is handled
 * automatically in resolveMachineName and doesn't need an alias entry.
 */
export function computeAutoAliases(events: WinEvent[]): AutoAliasResult {
  const detected: DetectedAlias[] = [];

  // -- Collect all unique machine names (System.Computer values) --
  const machineNames = new Map<string, string>(); // lowercase → first-seen original casing
  for (const event of events) {
    const lower = event.machineName.toLowerCase();
    if (!machineNames.has(lower)) machineNames.set(lower, event.machineName);
  }

  // Also index by FQDN-stripped short name for lookups
  const shortToFull = new Map<string, string[]>(); // short lowercase → full lowercase names
  for (const lower of machineNames.keys()) {
    const sn = stripFqdn(lower).toLowerCase();
    if (!shortToFull.has(sn)) shortToFull.set(sn, []);
    shortToFull.get(sn)!.push(lower);
  }

  // Helper: is this lowercase name (or its short form) a known machine?
  function isKnownMachine(nameLower: string): boolean {
    if (machineNames.has(nameLower)) return true;
    const variants = shortToFull.get(nameLower);
    return !!variants && variants.length > 0;
  }

  // -- Union-Find to merge equivalent machine names --
  const uf = createUnionFind();

  // Initialize: FQDN and short form are always equivalent
  for (const lower of machineNames.keys()) {
    uf.find(lower);
    const sn = stripFqdn(lower).toLowerCase();
    if (sn !== lower) {
      uf.find(sn);
      uf.union(lower, sn);
    }
  }

  // Track merge reasons for transparency
  const mergeReasons = new Map<string, { method: DetectedAlias['method']; detail: string }>();
  function recordMerge(a: string, b: string, method: DetectedAlias['method'], detail: string) {
    const key = [a, b].sort().join('|');
    if (!mergeReasons.has(key)) {
      mergeReasons.set(key, { method, detail });
    }
    uf.union(a, b);
  }

  // ---- Strategy 1: SID-based correlation ----
  // Group machine account SIDs by SID value → set of System.Computer names
  const sidToComputers = new Map<string, Set<string>>();

  for (const event of events) {
    const dataArray = getDataArray(event);
    if (!dataArray) continue;

    const subjectUser = getDataField(dataArray, 'SubjectUserName');
    if (!subjectUser?.endsWith('$')) continue;

    const sid = getDataField(dataArray, 'SubjectUserSid');
    if (!sid || !sid.startsWith('S-1-5-21-')) continue; // only domain SIDs are unique

    const computerLower = event.machineName.toLowerCase();
    if (!sidToComputers.has(sid)) sidToComputers.set(sid, new Set());
    sidToComputers.get(sid)!.add(computerLower);
  }

  for (const [sid, computers] of sidToComputers) {
    if (computers.size < 2) continue;
    const list = [...computers];
    // Union all computers that share the same machine account SID
    for (let i = 1; i < list.length; i++) {
      recordMerge(list[0], list[i], 'sid', `SID ${sid.slice(0, 20)}…`);
    }
  }

  // ---- Strategy 2: Machine account name correlation ----
  // If SubjectUserName=KIOSK-3$ on events from WIN-P9BH8VOHHKG,
  // and KIOSK-3 is also a known machine name → they're the same computer
  const accountOnComputer = new Map<string, Set<string>>();

  for (const event of events) {
    const dataArray = getDataArray(event);
    if (!dataArray) continue;

    const subjectUser = getDataField(dataArray, 'SubjectUserName');
    if (!subjectUser?.endsWith('$')) continue;

    const accountLower = subjectUser.slice(0, -1).toLowerCase();
    const computerLower = event.machineName.toLowerCase();
    const computerShort = stripFqdn(computerLower).toLowerCase();

    // Skip if the account name is already the same as the computer
    if (accountLower === computerLower || accountLower === computerShort) continue;

    if (!accountOnComputer.has(accountLower)) accountOnComputer.set(accountLower, new Set());
    accountOnComputer.get(accountLower)!.add(computerLower);
  }

  for (const [account, computers] of accountOnComputer) {
    if (!isKnownMachine(account)) continue; // account must also be a machine node
    for (const computer of computers) {
      recordMerge(account, computer, 'machine-account', `account ${account}$`);
    }
  }

  // ---- Strategy 3: Local logon WorkstationName ----
  // For Type 2/7/11 logons, WorkstationName is the local machine
  const wsOnComputer = new Map<string, Map<string, number>>();

  for (const event of events) {
    if (event.eventId !== 4624 && event.eventId !== 4625) continue;

    const dataArray = getDataArray(event);
    if (!dataArray) continue;

    const logonType = parseInt(getDataField(dataArray, 'LogonType') || '-1', 10);
    if (!LOCAL_LOGON_TYPES.has(logonType)) continue;

    const ws = getDataField(dataArray, 'WorkstationName');
    if (!ws || ws === '-') continue;

    const wsLower = ws.toLowerCase();
    const computerLower = event.machineName.toLowerCase();
    const computerShort = stripFqdn(computerLower).toLowerCase();

    if (wsLower === computerLower || wsLower === computerShort) continue;

    if (!wsOnComputer.has(wsLower)) wsOnComputer.set(wsLower, new Map());
    const computers = wsOnComputer.get(wsLower)!;
    computers.set(computerLower, (computers.get(computerLower) ?? 0) + 1);
  }

  for (const [ws, computers] of wsOnComputer) {
    for (const [computer, count] of computers) {
      recordMerge(ws, computer, 'local-logon', `${count} local logon event${count !== 1 ? 's' : ''}`);
    }
  }

  // ---- Build alias map from equivalence classes ----
  const aliases: MachineAliasMap = {};

  for (const members of uf.groups().values()) {
    // Only care about groups with multiple real machine names
    const realMembers = members.filter((m) => machineNames.has(m));
    if (realMembers.length < 2) continue;

    // Pick canonical name: shortest, prefer names that don't look auto-generated (WIN-xxx)
    realMembers.sort((a, b) => {
      const aAuto = /^win-[a-z0-9]{6,}$/i.test(machineNames.get(a)!);
      const bAuto = /^win-[a-z0-9]{6,}$/i.test(machineNames.get(b)!);
      if (aAuto !== bAuto) return aAuto ? 1 : -1; // prefer non-auto-generated
      return a.length - b.length; // then shortest
    });

    const canonicalLower = realMembers[0];
    const canonicalDisplay = machineNames.get(canonicalLower)!;

    for (let i = 1; i < realMembers.length; i++) {
      const rawLower = realMembers[i];
      const rawDisplay = machineNames.get(rawLower)!;

      // Skip FQDN variants — handled automatically by resolveMachineName
      if (stripFqdn(rawLower).toLowerCase() === stripFqdn(canonicalLower).toLowerCase()) continue;

      aliases[rawLower] = canonicalDisplay;

      // Find the reason for this pair
      const key = [canonicalLower, rawLower].sort().join('|');
      const reason = mergeReasons.get(key);
      detected.push({
        rawName: rawDisplay,
        canonicalName: canonicalDisplay,
        method: reason?.method ?? 'fqdn',
        detail: reason?.detail ?? 'FQDN match',
      });
    }
  }

  return { aliases, detected };
}
