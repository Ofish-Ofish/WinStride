import { resolveTriState } from '../../security/shared/filterTypes';
import { SYSMON_EVENT_IDS } from './eventMeta';
import type { SysmonFilters } from './filterTypes';

export function buildSysmonFilter(filters: SysmonFilters): string {
  const parts: string[] = ["logName eq 'Microsoft-Windows-Sysmon/Operational'"];

  const effectiveEventIds = resolveTriState(SYSMON_EVENT_IDS, filters.eventFilters);
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
