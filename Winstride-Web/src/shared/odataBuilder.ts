import type { FilterState } from '../components/filter/filterPrimitives';
import { resolveTriState } from '../components/filter/filterPrimitives';

interface ODataFilterInput {
  eventFilters: Map<number, FilterState>;
  timeStart: string;
  timeEnd: string;
}

export function buildModuleODataFilter(
  logName: string,
  allEventIds: number[],
  filters: ODataFilterInput,
): string {
  const parts: string[] = [`logName eq '${logName}'`];

  const effectiveEventIds = resolveTriState(allEventIds, filters.eventFilters);
  if (effectiveEventIds.length > 0) {
    const orClauses = effectiveEventIds.map((id) => `eventId eq ${id}`).join(' or ');
    parts.push(`(${orClauses})`);
  } else {
    parts.push('eventId eq -1');
  }

  if (filters.timeStart) {
    const iso = new Date(filters.timeStart).toISOString().replace('Z', '+00:00');
    parts.push(`timeCreated gt ${iso}`);
  }
  if (filters.timeEnd) {
    const iso = new Date(filters.timeEnd).toISOString().replace('Z', '+00:00');
    parts.push(`timeCreated lt ${iso}`);
  }

  return parts.join(' and ');
}
