import { buildModuleODataFilter } from '../../../shared/odataBuilder';
import { SYSMON_EVENT_IDS } from './eventMeta';
import type { SysmonFilters } from './filterTypes';

export function buildSysmonFilter(filters: SysmonFilters): string {
  return buildModuleODataFilter(
    'Microsoft-Windows-Sysmon/Operational',
    SYSMON_EVENT_IDS,
    filters,
  );
}
