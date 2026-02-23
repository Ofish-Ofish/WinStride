import type { GraphFilters, FilterState } from './filterTypes';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SerializedGraphFilters {
  eventFilters: [number, FilterState][];
  timeStart: string;
  timeEnd: string;
  machineFilters: [string, FilterState][];
  userFilters: [string, FilterState][];
  logonTypeFilters: [number, FilterState][];
  ipFilters?: [string, FilterState][];
  authPackageFilters?: [string, FilterState][];
  processFilters?: [string, FilterState][];
  failureStatusFilters?: [string, FilterState][];
  showElevatedOnly?: boolean;
  activityMin: number;
  activityMax: number;    // Infinity stored as null in JSON
  hideMachineAccounts: boolean;
  severityFilter?: string[];
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
    timeStart: f.timeStart,
    timeEnd: f.timeEnd,
    machineFilters: [...f.machineFilters.entries()],
    userFilters: [...f.userFilters.entries()],
    logonTypeFilters: [...f.logonTypeFilters.entries()],
    ipFilters: [...f.ipFilters.entries()],
    authPackageFilters: [...f.authPackageFilters.entries()],
    processFilters: [...f.processFilters.entries()],
    failureStatusFilters: [...f.failureStatusFilters.entries()],
    showElevatedOnly: f.showElevatedOnly,
    activityMin: f.activityMin,
    activityMax: f.activityMax === Infinity ? (null as unknown as number) : f.activityMax,
    hideMachineAccounts: f.hideMachineAccounts,
    severityFilter: [...f.severityFilter],
  };
}

export function deserializeFilters(s: SerializedGraphFilters): GraphFilters {
  return {
    eventFilters: new Map(s.eventFilters),
    timeStart: s.timeStart,
    timeEnd: s.timeEnd,
    machineFilters: new Map(s.machineFilters),
    userFilters: new Map(s.userFilters),
    logonTypeFilters: new Map(s.logonTypeFilters),
    ipFilters: new Map(s.ipFilters ?? []),
    authPackageFilters: new Map(s.authPackageFilters ?? []),
    processFilters: new Map(s.processFilters ?? []),
    failureStatusFilters: new Map(s.failureStatusFilters ?? []),
    showElevatedOnly: s.showElevatedOnly ?? false,
    activityMin: s.activityMin,
    activityMax: s.activityMax == null ? Infinity : s.activityMax,
    hideMachineAccounts: s.hideMachineAccounts,
    severityFilter: new Set(s.severityFilter ?? ['undetected', 'low', 'medium', 'high', 'critical']) as GraphFilters['severityFilter'],
  };
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

const VALID_FILTER_STATES = new Set(['select', 'exclude']);

function isFilterStatePair(arr: unknown): arr is [unknown, FilterState] {
  return Array.isArray(arr) && arr.length === 2 && VALID_FILTER_STATES.has(arr[1] as string);
}

function isSerializedFilters(v: unknown): v is SerializedGraphFilters {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.eventFilters) || !o.eventFilters.every(isFilterStatePair)) return false;
  if (typeof o.timeStart !== 'string') return false;
  if (typeof o.timeEnd !== 'string') return false;
  if (!Array.isArray(o.machineFilters) || !o.machineFilters.every(isFilterStatePair)) return false;
  if (!Array.isArray(o.userFilters) || !o.userFilters.every(isFilterStatePair)) return false;
  if (!Array.isArray(o.logonTypeFilters) || !o.logonTypeFilters.every(isFilterStatePair)) return false;
  if (typeof o.activityMin !== 'number') return false;
  if (o.activityMax !== null && typeof o.activityMax !== 'number') return false;
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
