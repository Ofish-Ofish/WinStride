import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import GraphFilterPanel from '../graph/GraphFilterPanel';
import { DEFAULT_FILTERS, resolveTriState, type GraphFilters } from '../shared/filterTypes';
import { EVENT_LABELS, LOGON_TYPE_LABELS, isSystemAccount } from '../shared/eventMeta';
import { loadFiltersFromStorage, saveFiltersToStorage } from '../shared/filterSerializer';
import { buildODataFilter } from '../shared/buildODataFilter';
import type { WinEvent } from '../shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { relativeTime } from '../../../shared/listUtils';
import EventDetailRow from './EventDetailRow';
import VirtualizedEventList from '../../../components/list/VirtualizedEventList';
import { COLUMNS, parseEventData, securityJsonMapper, type ParsedEventData } from './listColumns';

/* ------------------------------------------------------------------ */
/*  Level badge                                                        */
/* ------------------------------------------------------------------ */

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-gray-400">-</span>;
  const colors: Record<string, string> = {
    Information: 'text-blue-300',
    Warning: 'text-yellow-300',
    Error: 'text-red-400',
    Critical: 'text-red-300 font-semibold',
  };
  return <span className={colors[level] ?? 'text-gray-200'}>{level}</span>;
}

/* ------------------------------------------------------------------ */
/*  Cell renderer                                                      */
/* ------------------------------------------------------------------ */

function renderCell(col: ColumnDef, event: WinEvent): React.ReactNode | null {
  switch (col.key) {
    case 'eventId': {
      const label = EVENT_LABELS[event.eventId];
      return (
        <span className="flex items-center gap-2">
          <span className="font-mono">{event.eventId}</span>
          {label && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${
              event.eventId === 4625
                ? 'bg-[#f85149]/20 text-[#ff7b72]'
                : event.eventId === 4624
                  ? 'bg-[#3fb950]/20 text-[#56d364]'
                  : event.eventId === 4672
                    ? 'bg-[#f0883e]/20 text-[#f0a050]'
                    : 'bg-[#58a6ff]/15 text-[#79c0ff]'
            }`}>
              {label}
            </span>
          )}
        </span>
      );
    }
    case 'level':
      return <LevelBadge level={event.level} />;
    case 'time':
      return (
        <span title={new Date(event.timeCreated).toISOString()}>
          {relativeTime(event.timeCreated)}
        </span>
      );
    default:
      return null; // use default
  }
}

/* ------------------------------------------------------------------ */
/*  Query field resolver (for field:value search syntax)               */
/* ------------------------------------------------------------------ */

function getFieldForQuery(field: string, e: WinEvent, parsed: ParsedEventData | null, label: string): string | null {
  switch (field) {
    case 'event': case 'eventid': case 'id': return `${e.eventId} ${label}`;
    case 'level': return e.level ?? '';
    case 'machine': case 'host': return e.machineName;
    case 'user': case 'target': return parsed?.targetUserName ?? '';
    case 'domain': return parsed?.targetDomainName ?? '';
    case 'subject': return parsed?.subjectUserName ?? '';
    case 'logontype': case 'logon': case 'type': return parsed?.logonTypeLabel ?? '';
    case 'ip': case 'address': return parsed?.ipAddress ?? '';
    case 'port': return parsed?.ipPort ?? '';
    case 'auth': case 'package': return parsed?.authPackage ?? '';
    case 'process': return parsed?.processName ?? '';
    case 'workstation': return parsed?.workstationName ?? '';
    case 'status': case 'failure': return `${parsed?.failureStatus ?? ''} ${parsed?.failureSubStatus ?? ''}`;
    case 'elevated': case 'admin': return parsed?.elevatedToken ? 'yes' : 'no';
    default: return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function EventList({ visible }: { visible: boolean }) {
  /* ---- Filter state (shared with graph view) ---- */
  const [filters, setFilters] = useState<GraphFilters>(() => loadFiltersFromStorage() ?? DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => { saveFiltersToStorage(filters); }, [filters]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  /* ---- OData filter ---- */
  const odataFilter = useMemo(
    () => buildODataFilter(filters),
    [filters.eventFilters, filters.timeStart, filters.timeEnd],
  );

  /* ---- Data fetch ---- */
  const { data: rawEvents, isLoading, error } = useQuery<WinEvent[]>({
    queryKey: ['events', 'security-list', odataFilter],
    queryFn: () => fetchEvents({
      $filter: odataFilter,
      $select: 'id,eventId,level,machineName,timeCreated,eventData',
      $orderby: 'timeCreated desc',
    }),
    refetchInterval: 30_000,
    enabled: visible,
  });

  /* ---- Available values for filter panel ---- */
  const { availableMachines, availableUsers, availableIps, availableAuthPackages, availableProcesses, availableFailureStatuses } = useMemo(() => {
    if (!rawEvents) return { availableMachines: [], availableUsers: [], availableIps: [], availableAuthPackages: [], availableProcesses: [], availableFailureStatuses: [] };
    const machines = new Set<string>();
    const users = new Set<string>();
    const ips = new Set<string>();
    const authPkgs = new Set<string>();
    const procs = new Set<string>();
    const failStatuses = new Set<string>();
    for (const e of rawEvents) {
      machines.add(e.machineName);
      const parsed = parseEventData(e);
      if (!parsed) continue;
      if (parsed.targetUserName) users.add(parsed.targetUserName);
      if (parsed.ipAddress && parsed.ipAddress !== '-') ips.add(parsed.ipAddress);
      if (parsed.authPackage) authPkgs.add(parsed.authPackage);
      if (parsed.processName && parsed.processName !== '-') procs.add(parsed.processName);
      if (parsed.failureStatus && parsed.failureStatus !== '0x0') failStatuses.add(parsed.failureStatus);
      if (parsed.failureSubStatus && parsed.failureSubStatus !== '0x0') failStatuses.add(parsed.failureSubStatus);
    }
    return {
      availableMachines: [...machines].sort(),
      availableUsers: [...users].sort(),
      availableIps: [...ips].sort(),
      availableAuthPackages: [...authPkgs].sort(),
      availableProcesses: [...procs].sort(),
      availableFailureStatuses: [...failStatuses].sort(),
    };
  }, [rawEvents]);

  const maxActivity = 50;

  /* ---- Client-side filtering ---- */
  const filteredEvents = useMemo(() => {
    if (!rawEvents) return [];
    let events = rawEvents;

    // Logon type filter
    if (filters.logonTypeFilters.size > 0) {
      const allLogonTypes = Object.keys(LOGON_TYPE_LABELS).map(Number);
      const allowed = new Set(resolveTriState(allLogonTypes, filters.logonTypeFilters));
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        if (!parsed || parsed.logonType < 0) return true;
        return allowed.has(parsed.logonType);
      });
    }

    // Hide machine/system accounts
    if (filters.hideMachineAccounts) {
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        if (!parsed || !parsed.targetUserName) return true;
        return !isSystemAccount(parsed.targetUserName);
      });
    }

    // Machine filter
    if (filters.machineFilters.size > 0) {
      const selected = new Set<string>();
      const excluded = new Set<string>();
      for (const [name, state] of filters.machineFilters) {
        if (state === 'select') selected.add(name);
        else if (state === 'exclude') excluded.add(name);
      }
      if (selected.size > 0) {
        events = events.filter((e) => selected.has(e.machineName));
      } else if (excluded.size > 0) {
        events = events.filter((e) => !excluded.has(e.machineName));
      }
    }

    // User filter
    if (filters.userFilters.size > 0) {
      const selected = new Set<string>();
      const excluded = new Set<string>();
      for (const [name, state] of filters.userFilters) {
        if (state === 'select') selected.add(name);
        else if (state === 'exclude') excluded.add(name);
      }
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        const userName = parsed?.targetUserName ?? '';
        if (!userName) return true;
        if (selected.size > 0) return selected.has(userName);
        if (excluded.size > 0) return !excluded.has(userName);
        return true;
      });
    }

    // IP filter
    if (filters.ipFilters.size > 0) {
      const allowedIps = new Set(resolveTriState(availableIps, filters.ipFilters));
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        if (!parsed || !parsed.ipAddress || parsed.ipAddress === '-') return true;
        return allowedIps.has(parsed.ipAddress);
      });
    }

    // Auth package filter
    if (filters.authPackageFilters.size > 0) {
      const allowedPkgs = new Set(resolveTriState(availableAuthPackages, filters.authPackageFilters));
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        if (!parsed || !parsed.authPackage) return true;
        return allowedPkgs.has(parsed.authPackage);
      });
    }

    // Process filter
    if (filters.processFilters.size > 0) {
      const allowedProcs = new Set(resolveTriState(availableProcesses, filters.processFilters));
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        if (!parsed || !parsed.processName || parsed.processName === '-') return true;
        return allowedProcs.has(parsed.processName);
      });
    }

    // Failure status filter
    if (filters.failureStatusFilters.size > 0) {
      const allowedStatuses = new Set(resolveTriState(availableFailureStatuses, filters.failureStatusFilters));
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        if (!parsed) return true;
        if ((!parsed.failureStatus || parsed.failureStatus === '0x0') && (!parsed.failureSubStatus || parsed.failureSubStatus === '0x0')) return true;
        return allowedStatuses.has(parsed.failureStatus) || allowedStatuses.has(parsed.failureSubStatus);
      });
    }

    // Elevated only
    if (filters.showElevatedOnly) {
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        return parsed?.elevatedToken === true;
      });
    }

    // Search — supports plain text and field:value queries
    if (debouncedSearch) {
      const terms = debouncedSearch.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        const label = EVENT_LABELS[e.eventId] ?? '';
        const allFields = [
          String(e.eventId), label, e.level ?? '', e.machineName, e.timeCreated,
          parsed?.targetUserName ?? '', parsed?.targetDomainName ?? '',
          parsed?.subjectUserName ?? '', parsed?.subjectDomainName ?? '',
          parsed?.logonTypeLabel ?? '', parsed?.ipAddress ?? '', parsed?.ipPort ?? '',
          parsed?.authPackage ?? '', parsed?.logonProcess ?? '',
          parsed?.workstationName ?? '', parsed?.processName ?? '',
          parsed?.failureStatus ?? '', parsed?.failureSubStatus ?? '',
        ].join(' ').toLowerCase();

        return terms.every((term) => {
          const colonIdx = term.indexOf(':');
          if (colonIdx > 0) {
            const field = term.slice(0, colonIdx).toLowerCase();
            let value = term.slice(colonIdx + 1).toLowerCase().replace(/^"|"$/g, '');
            const fieldValue = getFieldForQuery(field, e, parsed, label);
            if (fieldValue !== null) return fieldValue.toLowerCase().includes(value);
          }
          return allFields.includes(term.toLowerCase().replace(/^"|"$/g, ''));
        });
      });
    }

    return events;
  }, [rawEvents, filters, debouncedSearch, availableIps, availableAuthPackages, availableProcesses, availableFailureStatuses]);

  const toggleFilters = useCallback(() => setShowFilters((v) => !v), []);

  /* ---- Render ---- */
  return (
    <VirtualizedEventList
      visible={visible}
      isLoading={isLoading}
      error={!!error}
      columns={COLUMNS}
      columnsStorageKey="winstride:listColumns"
      searchPlaceholder="Search... (ip:192.168 user:admin)"
      emptyMessage="No events found. Make sure the Agent is collecting Security events."
      eventLabels={EVENT_LABELS}
      eventIdColumnKey="eventId"
      exportPrefix="winstride-events"
      renderCell={renderCell}
      renderDetailRow={(event) => <EventDetailRow event={event} />}
      renderFilterPanel={() => (
        <GraphFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          availableMachines={availableMachines}
          availableUsers={availableUsers}
          availableIps={availableIps}
          availableAuthPackages={availableAuthPackages}
          availableProcesses={availableProcesses}
          availableFailureStatuses={availableFailureStatuses}
          maxActivity={maxActivity}
        />
      )}
      showFilters={showFilters}
      onToggleFilters={toggleFilters}
      filteredEvents={filteredEvents}
      rawCount={rawEvents?.length ?? 0}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={securityJsonMapper}
    />
  );
}
