import { resolveTriState, type GraphFilters } from './filterTypes';
import { ALL_EVENT_IDS } from './eventMeta';

export function buildODataFilter(filters: GraphFilters): string {
  const parts: string[] = ["logName eq 'Security'"];

  const effectiveEventIds = resolveTriState(ALL_EVENT_IDS, filters.eventFilters);
  if (effectiveEventIds.length > 0) {
    const orClauses = effectiveEventIds.map((id) => `eventId eq ${id}`).join(' or ');
    parts.push(`(${orClauses})`);
  } else {
    // All events excluded — return nothing from server
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
