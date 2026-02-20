import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import { DEFAULT_SYSMON_FILTERS, type SysmonFilters } from '../shared/filterTypes';
import { loadSysmonFilters, saveSysmonFilters } from '../shared/filterSerializer';
import { buildSysmonFilter } from '../shared/buildSysmonFilter';
import { SYSMON_EVENT_LABELS, EVENT_COLORS, INTEGRITY_COLORS } from '../shared/eventMeta';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';
import SysmonFilterPanel from '../SysmonFilterPanel';
import SysmonDetailRow from './SysmonDetailRow';
import type { WinEvent } from '../../security/shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { relativeTime } from '../../../shared/listUtils';
import { resolveTriState } from '../../../components/filter/filterPrimitives';
import VirtualizedEventList from '../../../components/list/VirtualizedEventList';
import { COLUMNS, sysmonJsonMapper } from './sysmonColumns';

/* ------------------------------------------------------------------ */
/*  Cell renderer                                                      */
/* ------------------------------------------------------------------ */

function renderCell(col: ColumnDef, event: WinEvent): React.ReactNode | null {
  switch (col.key) {
    case 'type': {
      const label = SYSMON_EVENT_LABELS[event.eventId];
      const colors = EVENT_COLORS[event.eventId] ?? { bg: 'bg-gray-600/20', text: 'text-gray-300' };
      return (
        <span className="flex items-center gap-2">
          <span className="font-mono">{event.eventId}</span>
          {label && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${colors.bg} ${colors.text}`}>
              {label}
            </span>
          )}
        </span>
      );
    }
    case 'integrity': {
      const val = String(col.getValue(event));
      if (!val) return <span className="text-gray-500">-</span>;
      const color = INTEGRITY_COLORS[val] ?? 'text-gray-300';
      return <span className={color}>{val}</span>;
    }
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
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SysmonEventList({ visible }: { visible: boolean }) {
  /* ---- Filter state ---- */
  const [filters, setFilters] = useState<SysmonFilters>(() => loadSysmonFilters() ?? DEFAULT_SYSMON_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => { saveSysmonFilters(filters); }, [filters]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  /* ---- OData filter ---- */
  const odataFilter = useMemo(
    () => buildSysmonFilter(filters),
    [filters.eventFilters, filters.timeStart, filters.timeEnd],
  );

  /* ---- Data fetch ---- */
  const { data: rawEvents, isLoading, error } = useQuery<WinEvent[]>({
    queryKey: ['events', 'sysmon-list', odataFilter],
    queryFn: () => fetchEvents({
      $filter: odataFilter,
      $select: 'id,eventId,level,machineName,timeCreated,eventData',
      $orderby: 'timeCreated desc',
    }),
    refetchInterval: 30_000,
    enabled: visible,
  });

  /* ---- Available values for filter panel ---- */
  const { availableMachines, availableProcesses, availableUsers } = useMemo(() => {
    if (!rawEvents) return { availableMachines: [], availableProcesses: [], availableUsers: [] };
    const machines = new Set<string>();
    const processes = new Set<string>();
    const users = new Set<string>();
    for (const e of rawEvents) {
      machines.add(e.machineName);
      const proc = parseProcessCreate(e);
      const net = parseNetworkConnect(e);
      const file = parseFileCreate(e);
      const imageName = proc?.imageName ?? net?.imageName ?? file?.imageName;
      if (imageName) processes.add(imageName);
      const user = proc?.user ?? net?.user ?? file?.user;
      if (user) users.add(user);
    }
    return {
      availableMachines: [...machines].sort(),
      availableProcesses: [...processes].sort(),
      availableUsers: [...users].sort(),
    };
  }, [rawEvents]);

  /* ---- Client-side filtering ---- */
  const filteredEvents = useMemo(() => {
    if (!rawEvents) return [];
    let events = rawEvents;

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

    // Process filter
    if (filters.processFilters.size > 0) {
      const allowed = new Set(resolveTriState(availableProcesses, filters.processFilters));
      events = events.filter((e) => {
        const proc = parseProcessCreate(e);
        const net = parseNetworkConnect(e);
        const file = parseFileCreate(e);
        const imageName = proc?.imageName ?? net?.imageName ?? file?.imageName;
        if (!imageName) return true;
        return allowed.has(imageName);
      });
    }

    // Integrity filter (Event 1 only)
    if (filters.integrityFilters.size > 0) {
      const allLevels = ['Low', 'Medium', 'High', 'System'];
      const allowed = new Set(resolveTriState(allLevels, filters.integrityFilters));
      events = events.filter((e) => {
        if (e.eventId !== 1) return true;
        const proc = parseProcessCreate(e);
        if (!proc?.integrityLevel) return true;
        return allowed.has(proc.integrityLevel);
      });
    }

    // User filter
    if (filters.userFilters.size > 0) {
      const allowed = new Set(resolveTriState(availableUsers, filters.userFilters));
      events = events.filter((e) => {
        const proc = parseProcessCreate(e);
        const net = parseNetworkConnect(e);
        const file = parseFileCreate(e);
        const user = proc?.user ?? net?.user ?? file?.user;
        if (!user) return true;
        return allowed.has(user);
      });
    }

    // Search
    if (debouncedSearch) {
      const lowerSearch = debouncedSearch.toLowerCase();
      events = events.filter((e) => {
        const proc = parseProcessCreate(e);
        const net = parseNetworkConnect(e);
        const file = parseFileCreate(e);
        const searchable = [
          String(e.eventId),
          SYSMON_EVENT_LABELS[e.eventId] ?? '',
          e.machineName,
          proc?.imageName ?? '', proc?.commandLine ?? '', proc?.user ?? '', proc?.parentImageName ?? '',
          net?.imageName ?? '', net?.destinationIp ?? '', String(net?.destinationPort ?? ''), net?.user ?? '',
          file?.imageName ?? '', file?.targetFilename ?? '', file?.user ?? '',
        ].join(' ').toLowerCase();
        return searchable.includes(lowerSearch);
      });
    }

    return events;
  }, [rawEvents, filters, debouncedSearch, availableProcesses, availableUsers]);

  const toggleFilters = useCallback(() => setShowFilters((v) => !v), []);

  /* ---- Render ---- */
  return (
    <VirtualizedEventList
      visible={visible}
      isLoading={isLoading}
      error={!!error}
      columns={COLUMNS}
      columnsStorageKey="winstride:sysmonColumns"
      searchPlaceholder="Search processes, IPs, files..."
      emptyMessage="No events found. Make sure the Agent is collecting Sysmon events."
      eventLabels={SYSMON_EVENT_LABELS}
      eventIdColumnKey="type"
      exportPrefix="winstride-sysmon"
      renderCell={renderCell}
      renderDetailRow={(event) => <SysmonDetailRow event={event} />}
      renderFilterPanel={() => (
        <SysmonFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          availableMachines={availableMachines}
          availableProcesses={availableProcesses}
          availableUsers={availableUsers}
        />
      )}
      showFilters={showFilters}
      onToggleFilters={toggleFilters}
      filteredEvents={filteredEvents}
      rawCount={rawEvents?.length ?? 0}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={sysmonJsonMapper}
    />
  );
}
