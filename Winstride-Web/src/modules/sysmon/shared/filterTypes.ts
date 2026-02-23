import type { FilterState } from '../../../components/filter/filterPrimitives';
import type { Severity } from '../../../shared/detection/rules';

export type { FilterState };

export interface SysmonFilters {
  eventFilters: Map<number, FilterState>;
  timeStart: string;
  timeEnd: string;
  machineFilters: Map<string, FilterState>;
  processFilters: Map<string, FilterState>;
  integrityFilters: Map<string, FilterState>;
  userFilters: Map<string, FilterState>;
  severityFilter: Set<Severity | 'undetected'>;
}

export function getDefaultSysmonFilters(): SysmonFilters {
  return {
    eventFilters: new Map<number, FilterState>([[1, 'select'], [3, 'select'], [11, 'select']]),
    timeStart: new Date(Date.now() - 259_200_000).toISOString(), // 3d ago
    timeEnd: '',
    machineFilters: new Map(),
    processFilters: new Map(),
    integrityFilters: new Map(),
    userFilters: new Map(),
    severityFilter: new Set<Severity | 'undetected'>(['undetected', 'low', 'medium', 'high', 'critical']),
  };
}

export const DEFAULT_SYSMON_FILTERS: SysmonFilters = getDefaultSysmonFilters();
