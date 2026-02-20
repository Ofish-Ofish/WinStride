import type { SysmonFilters, FilterState } from './filterTypes';

interface SerializedSysmonFilters {
  eventFilters: [number, FilterState][];
  timeStart: string;
  timeEnd: string;
  machineFilters: [string, FilterState][];
  processFilters: [string, FilterState][];
  integrityFilters: [string, FilterState][];
  userFilters: [string, FilterState][];
}

const STORAGE_KEY = 'winstride:sysmonFilters';

function serialize(f: SysmonFilters): SerializedSysmonFilters {
  return {
    eventFilters: [...f.eventFilters.entries()],
    timeStart: f.timeStart,
    timeEnd: f.timeEnd,
    machineFilters: [...f.machineFilters.entries()],
    processFilters: [...f.processFilters.entries()],
    integrityFilters: [...f.integrityFilters.entries()],
    userFilters: [...f.userFilters.entries()],
  };
}

function deserialize(s: SerializedSysmonFilters): SysmonFilters {
  return {
    eventFilters: new Map(s.eventFilters),
    timeStart: s.timeStart,
    timeEnd: s.timeEnd,
    machineFilters: new Map(s.machineFilters),
    processFilters: new Map(s.processFilters ?? []),
    integrityFilters: new Map(s.integrityFilters ?? []),
    userFilters: new Map(s.userFilters ?? []),
  };
}

function isValid(v: unknown): v is SerializedSysmonFilters {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.eventFilters) && typeof o.timeStart === 'string' && typeof o.timeEnd === 'string';
}

export function saveSysmonFilters(filters: SysmonFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(filters)));
  } catch { /* quota */ }
}

export function loadSysmonFilters(): SysmonFilters | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return null;
    return deserialize(parsed);
  } catch {
    return null;
  }
}
