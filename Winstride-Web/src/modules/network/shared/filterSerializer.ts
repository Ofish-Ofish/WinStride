import type { NetworkFilters, FilterState } from './filterTypes';

interface SerializedNetworkFilters {
  machineFilters: [string, FilterState][];
  stateFilters: [string, FilterState][];
  protocolFilters: [string, FilterState][];
  processFilters: [string, FilterState][];
}

const STORAGE_KEY = 'winstride:networkFilters';

function serialize(f: NetworkFilters): SerializedNetworkFilters {
  return {
    machineFilters: [...f.machineFilters.entries()],
    stateFilters: [...f.stateFilters.entries()],
    protocolFilters: [...f.protocolFilters.entries()],
    processFilters: [...f.processFilters.entries()],
  };
}

function deserialize(s: SerializedNetworkFilters): NetworkFilters {
  return {
    machineFilters: new Map(s.machineFilters),
    stateFilters: new Map(s.stateFilters),
    protocolFilters: new Map(s.protocolFilters),
    processFilters: new Map(s.processFilters),
  };
}

function isValid(v: unknown): v is SerializedNetworkFilters {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.machineFilters) &&
    Array.isArray(o.stateFilters) &&
    Array.isArray(o.protocolFilters) &&
    Array.isArray(o.processFilters)
  );
}

export function saveNetworkFilters(filters: NetworkFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(filters)));
  } catch { /* quota */ }
}

export function loadNetworkFilters(): NetworkFilters | null {
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
