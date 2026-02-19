import type { GraphFilters, FilterState } from './GraphFilterPanel';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SerializedGraphFilters {
  eventFilters: [number, FilterState][];
  timeRange: GraphFilters['timeRange'];
  machineFilters: [string, FilterState][];
  userFilters: [string, FilterState][];
  logonTypeFilters: [number, FilterState][];
  activityThreshold: number;
  hideMachineAccounts: boolean;
}

export interface FilterExport {
  version: 1;
  exportedAt: string;
  label?: string;
  filters: SerializedGraphFilters;
}

/* ------------------------------------------------------------------ */
/*  Serialize / Deserialize                                            */
/* ------------------------------------------------------------------ */

export function serializeFilters(f: GraphFilters): SerializedGraphFilters {
  return {
    eventFilters: [...f.eventFilters.entries()],
    timeRange: f.timeRange,
    machineFilters: [...f.machineFilters.entries()],
    userFilters: [...f.userFilters.entries()],
    logonTypeFilters: [...f.logonTypeFilters.entries()],
    activityThreshold: f.activityThreshold,
    hideMachineAccounts: f.hideMachineAccounts,
  };
}

export function deserializeFilters(s: SerializedGraphFilters): GraphFilters {
  return {
    eventFilters: new Map(s.eventFilters),
    timeRange: s.timeRange,
    machineFilters: new Map(s.machineFilters),
    userFilters: new Map(s.userFilters),
    logonTypeFilters: new Map(s.logonTypeFilters),
    activityThreshold: s.activityThreshold,
    hideMachineAccounts: s.hideMachineAccounts,
  };
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

const VALID_TIME_RANGES = new Set(['1h', '6h', '12h', '24h', '3d', '7d', '14d', '30d', 'all']);
const VALID_FILTER_STATES = new Set(['select', 'exclude']);

function isFilterStatePair(arr: unknown): arr is [unknown, FilterState] {
  return Array.isArray(arr) && arr.length === 2 && VALID_FILTER_STATES.has(arr[1] as string);
}

function isSerializedFilters(v: unknown): v is SerializedGraphFilters {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.eventFilters) || !o.eventFilters.every(isFilterStatePair)) return false;
  if (!VALID_TIME_RANGES.has(o.timeRange as string)) return false;
  if (!Array.isArray(o.machineFilters) || !o.machineFilters.every(isFilterStatePair)) return false;
  if (!Array.isArray(o.userFilters) || !o.userFilters.every(isFilterStatePair)) return false;
  if (!Array.isArray(o.logonTypeFilters) || !o.logonTypeFilters.every(isFilterStatePair)) return false;
  if (typeof o.activityThreshold !== 'number') return false;
  if (typeof o.hideMachineAccounts !== 'boolean') return false;
  return true;
}

export function validateFilterExport(v: unknown): v is FilterExport {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (typeof o.exportedAt !== 'string') return false;
  return isSerializedFilters(o.filters);
}

/* ------------------------------------------------------------------ */
/*  localStorage                                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'winstride:graphFilters';

export function saveFiltersToStorage(filters: GraphFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeFilters(filters)));
  } catch { /* quota / private mode */ }
}

export function loadFiltersFromStorage(): GraphFilters | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isSerializedFilters(parsed)) return null;
    return deserializeFilters(parsed);
  } catch {
    return null;
  }
}
