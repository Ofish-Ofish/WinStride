import { buildModuleODataFilter } from '../../../shared/odataBuilder';
import { ALL_EVENT_IDS } from './eventMeta';
import type { GraphFilters } from './filterTypes';

export function buildODataFilter(filters: GraphFilters, logName = 'Security'): string {
  return buildModuleODataFilter(logName, ALL_EVENT_IDS, filters);
}
