import { buildModuleODataFilter } from '../../../shared/odataBuilder';
import { PS_EVENT_IDS } from './eventMeta';
import type { PSFilters } from './filterTypes';

export function buildPSFilter(filters: PSFilters): string {
  return buildModuleODataFilter(
    'Microsoft-Windows-PowerShell/Operational',
    PS_EVENT_IDS,
    filters,
  );
}
