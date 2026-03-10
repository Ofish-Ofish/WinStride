import type { Preset } from '../../../components/filter';
import type { NetworkFilters, FilterState } from './filterTypes';
import { getDefaultNetworkFilters } from './filterTypes';

function preset(overrides: Partial<NetworkFilters>): NetworkFilters {
  return { ...getDefaultNetworkFilters(), ...overrides };
}

export const NETWORK_PRESETS: Preset<NetworkFilters>[] = [
  {
    id: 'builtin:all-connections',
    name: 'All',
    builtin: true,
    filters: preset({}),
  },
  {
    id: 'builtin:established',
    name: 'Established',
    builtin: true,
    filters: preset({
      stateFilters: new Map<string, FilterState>([['Established', 'select']]),
    }),
  },
  {
    id: 'builtin:listening',
    name: 'Listening',
    builtin: true,
    filters: preset({
      stateFilters: new Map<string, FilterState>([['Listen', 'select']]),
    }),
  },
];

/* ---- Serialization helpers for generic PresetBar ---- */

export function serializeNetworkFilters(f: NetworkFilters): unknown {
  return {
    machineFilters: [...f.machineFilters.entries()],
    stateFilters: [...f.stateFilters.entries()],
    protocolFilters: [...f.protocolFilters.entries()],
    processFilters: [...f.processFilters.entries()],
  };
}

export function deserializeNetworkFilters(s: unknown): NetworkFilters {
  const o = s as Record<string, unknown>;
  return {
    machineFilters: new Map((o.machineFilters as [string, FilterState][]) ?? []),
    stateFilters: new Map((o.stateFilters as [string, FilterState][]) ?? []),
    protocolFilters: new Map((o.protocolFilters as [string, FilterState][]) ?? []),
    processFilters: new Map((o.processFilters as [string, FilterState][]) ?? []),
  };
}

export function cloneNetworkFilters(f: NetworkFilters): NetworkFilters {
  return {
    machineFilters: new Map(f.machineFilters),
    stateFilters: new Map(f.stateFilters),
    protocolFilters: new Map(f.protocolFilters),
    processFilters: new Map(f.processFilters),
  };
}
