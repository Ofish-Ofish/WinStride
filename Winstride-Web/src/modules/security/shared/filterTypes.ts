/* ------------------------------------------------------------------ */
/*  Filter types                                                       */
/* ------------------------------------------------------------------ */

export type FilterState = 'select' | 'exclude';

export interface GraphFilters {
  eventFilters: Map<number, FilterState>;
  timeStart: string;   // ISO string or '' (unbounded = all time)
  timeEnd: string;     // ISO string or '' (unbounded = now)
  machineFilters: Map<string, FilterState>;
  userFilters: Map<string, FilterState>;
  logonTypeFilters: Map<number, FilterState>;
  activityMin: number; // default 1
  activityMax: number; // default Infinity (no upper cap)
  hideMachineAccounts: boolean;
}

export function getDefaultFilters(): GraphFilters {
  return {
    eventFilters: new Map<number, FilterState>([[4624, 'select'], [4625, 'select'], [4634, 'select']]),
    timeStart: new Date(Date.now() - 259_200_000).toISOString(), // 3d ago
    timeEnd: '',
    machineFilters: new Map(),
    userFilters: new Map(),
    logonTypeFilters: new Map(),
    activityMin: 1,
    activityMax: Infinity,
    hideMachineAccounts: true,
  };
}

export const DEFAULT_FILTERS: GraphFilters = getDefaultFilters();

/* ------------------------------------------------------------------ */
/*  Tri-state helpers                                                  */
/* ------------------------------------------------------------------ */

export function countVisible<T>(items: T[], filterMap: Map<T, FilterState>): number {
  const selected = items.filter((i) => filterMap.get(i) === 'select');
  if (selected.length > 0) return selected.length;
  const excluded = items.filter((i) => filterMap.get(i) === 'exclude');
  return items.length - excluded.length;
}

/** Resolve a tri-state Map into the effective set of allowed items. */
export function resolveTriState<T>(allItems: T[], filterMap: Map<T, FilterState>): T[] {
  const selected = allItems.filter((i) => filterMap.get(i) === 'select');
  if (selected.length > 0) return selected;
  const excludedSet = new Set(allItems.filter((i) => filterMap.get(i) === 'exclude'));
  if (excludedSet.size > 0) return allItems.filter((i) => !excludedSet.has(i));
  return allItems;
}

export function cycleMap<T>(map: Map<T, FilterState>, key: T): Map<T, FilterState> {
  const next = new Map(map);
  const current = next.get(key);
  if (current === undefined) next.set(key, 'select');
  else if (current === 'select') next.set(key, 'exclude');
  else next.delete(key);
  return next;
}
