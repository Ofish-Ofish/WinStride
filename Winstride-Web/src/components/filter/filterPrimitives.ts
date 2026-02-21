/* ------------------------------------------------------------------ */
/*  Shared tri-state filter primitives                                 */
/* ------------------------------------------------------------------ */

export type FilterState = 'select' | 'exclude';

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
