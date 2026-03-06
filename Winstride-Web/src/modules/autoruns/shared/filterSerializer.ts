import type { AutorunsFilters, FilterState } from './filterTypes';

interface SerializedAutorunsFilters {
  machineFilters: [string, FilterState][];
  categoryFilters: [string, FilterState][];
  verifiedFilter: 'all' | 'verified-only' | 'not-verified-only';
}

const STORAGE_KEY = 'winstride:autorunsFilters';

function serialize(f: AutorunsFilters): SerializedAutorunsFilters {
  return {
    machineFilters: [...f.machineFilters.entries()],
    categoryFilters: [...f.categoryFilters.entries()],
    verifiedFilter: f.verifiedFilter,
  };
}

function deserialize(s: SerializedAutorunsFilters): AutorunsFilters {
  return {
    machineFilters: new Map(s.machineFilters),
    categoryFilters: new Map(s.categoryFilters),
    verifiedFilter: s.verifiedFilter ?? 'all',
  };
}

function isValid(v: unknown): v is SerializedAutorunsFilters {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.machineFilters) &&
    Array.isArray(o.categoryFilters) &&
    typeof o.verifiedFilter === 'string'
  );
}

export function saveAutorunsFilters(filters: AutorunsFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(filters)));
  } catch { /* quota */ }
}

export function loadAutorunsFilters(): AutorunsFilters | null {
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
