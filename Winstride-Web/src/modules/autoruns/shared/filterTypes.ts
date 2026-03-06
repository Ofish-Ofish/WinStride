import type { FilterState } from '../../../components/filter/filterPrimitives';

export type { FilterState };

export interface AutorunsFilters {
  machineFilters: Map<string, FilterState>;
  categoryFilters: Map<string, FilterState>;
  verifiedFilter: 'all' | 'verified-only' | 'not-verified-only';
}

export function getDefaultAutorunsFilters(): AutorunsFilters {
  return {
    machineFilters: new Map(),
    categoryFilters: new Map(),
    verifiedFilter: 'all',
  };
}

export const DEFAULT_AUTORUNS_FILTERS: AutorunsFilters = getDefaultAutorunsFilters();
