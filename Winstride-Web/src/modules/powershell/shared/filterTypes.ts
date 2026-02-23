import type { FilterState } from '../../../components/filter/filterPrimitives';
import type { Severity } from '../../../shared/detection/rules';

export type { FilterState };

export interface PSFilters {
  eventFilters: Map<number, FilterState>;
  timeStart: string;
  timeEnd: string;
  machineFilters: Map<string, FilterState>;
  levelFilter: 'all' | 'warning-only';
  minSeverity: Severity | null;
  hideUndetected: boolean;
}

export function getDefaultPSFilters(): PSFilters {
  return {
    eventFilters: new Map<number, FilterState>([[4103, 'select'], [4104, 'select']]),
    timeStart: new Date(Date.now() - 259_200_000).toISOString(), // 3d ago
    timeEnd: '',
    machineFilters: new Map(),
    levelFilter: 'all',
    minSeverity: 'low',
    hideUndetected: false,
  };
}

export const DEFAULT_PS_FILTERS: PSFilters = getDefaultPSFilters();
