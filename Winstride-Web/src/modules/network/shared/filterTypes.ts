import type { FilterState } from '../../../components/filter/filterPrimitives';

export type { FilterState };

export interface NetworkFilters {
  machineFilters: Map<string, FilterState>;
  stateFilters: Map<string, FilterState>;
  protocolFilters: Map<string, FilterState>;
  processFilters: Map<string, FilterState>;
}

export function getDefaultNetworkFilters(): NetworkFilters {
  return {
    machineFilters: new Map(),
    stateFilters: new Map(),
    protocolFilters: new Map(),
    processFilters: new Map(),
  };
}

export const DEFAULT_NETWORK_FILTERS: NetworkFilters = getDefaultNetworkFilters();
