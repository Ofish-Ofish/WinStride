import type { PSFilters, FilterState } from './filterTypes';

interface SerializedPSFilters {
  eventFilters: [number, FilterState][];
  timeStart: string;
  timeEnd: string;
  machineFilters: [string, FilterState][];
  levelFilter: 'all' | 'warning-only';
  minSeverity?: string | null;
  hideUndetected?: boolean;
}

const STORAGE_KEY = 'winstride:psFilters';

function serialize(f: PSFilters): SerializedPSFilters {
  return {
    eventFilters: [...f.eventFilters.entries()],
    timeStart: f.timeStart,
    timeEnd: f.timeEnd,
    machineFilters: [...f.machineFilters.entries()],
    levelFilter: f.levelFilter,
    minSeverity: f.minSeverity,
    hideUndetected: f.hideUndetected,
  };
}

function deserialize(s: SerializedPSFilters): PSFilters {
  return {
    eventFilters: new Map(s.eventFilters),
    timeStart: s.timeStart,
    timeEnd: s.timeEnd,
    machineFilters: new Map(s.machineFilters),
    levelFilter: s.levelFilter ?? 'all',
    minSeverity: (s.minSeverity as PSFilters['minSeverity']) ?? 'low',
    hideUndetected: s.hideUndetected ?? false,
  };
}

function isValid(v: unknown): v is SerializedPSFilters {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.eventFilters) && typeof o.timeStart === 'string' && typeof o.timeEnd === 'string';
}

export function savePSFilters(filters: PSFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(filters)));
  } catch { /* quota */ }
}

export function loadPSFilters(): PSFilters | null {
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
