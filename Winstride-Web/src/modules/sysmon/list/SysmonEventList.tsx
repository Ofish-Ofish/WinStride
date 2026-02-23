import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { DEFAULT_SYSMON_FILTERS, type SysmonFilters } from '../shared/filterTypes';
import { loadSysmonFilters, saveSysmonFilters } from '../shared/filterSerializer';
import { SYSMON_EVENT_LABELS, SYSMON_EVENT_IDS, EVENT_COLORS, INTEGRITY_COLORS } from '../shared/eventMeta';
import { useModuleEvents } from '../../../shared/hooks/useModuleEvents';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';
import SysmonFilterPanel from '../SysmonFilterPanel';
import SysmonDetailRow from './SysmonDetailRow';
import type { WinEvent } from '../../security/shared/types';
import { useSeverityIntegration } from '../../../shared/detection/engine';
import { renderSeverityCell } from '../../../shared/detection/SeverityBadge';
import type { ColumnDef } from '../../../shared/listUtils';
import { relativeTime, applySearch } from '../../../shared/listUtils';
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
/*  Extra search fields (fields not in column definitions)             */
/* ------------------------------------------------------------------ */

function getExtraSearchFields(e: WinEvent, severityLabel: string): Record<string, string> {
  const net = parseNetworkConnect(e);
  const file = parseFileCreate(e);
  return {
    risk: severityLabel, severity: severityLabel,
    ip: net?.destinationIp ?? '', destination: net?.destinationIp ?? '', dst: net?.destinationIp ?? '',
    port: String(net?.destinationPort ?? ''),
    protocol: net?.protocol ?? '',
    file: file?.targetFilename ?? '', path: file?.targetFilename ?? '',
  };
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

  /* ---- Data fetch ---- */
  const { events: rawEvents, isLoading, error, isComplete, loadedCount, totalCount } = useModuleEvents({
    logName: 'Microsoft-Windows-Sysmon/Operational',
    allEventIds: SYSMON_EVENT_IDS,
    eventFilters: filters.eventFilters,
    timeStart: filters.timeStart,
    timeEnd: filters.timeEnd,
  }, { enabled: visible });

  const deferredEvents = useDeferredValue(rawEvents);

  const sev = useSeverityIntegration(deferredEvents, 'sysmon');

  /* ---- Available values for filter panel ---- */
  const { availableMachines, availableProcesses, availableUsers } = useMemo(() => {
    if (deferredEvents.length === 0) return { availableMachines: [], availableProcesses: [], availableUsers: [] };
    const machines = new Set<string>();
    const processes = new Set<string>();
    const users = new Set<string>();
    for (const e of deferredEvents) {
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
  }, [deferredEvents]);

  /* ---- Client-side filtering (single pass, no sev dependency) ---- */
  const dataFiltered = useMemo(() => {
    if (deferredEvents.length === 0) return [];

    // Pre-compute filter sets
    let machineSelect: Set<string> | null = null;
    let machineExclude: Set<string> | null = null;
    if (filters.machineFilters.size > 0) {
      const sel = new Set<string>(); const exc = new Set<string>();
      for (const [n, s] of filters.machineFilters) { if (s === 'select') sel.add(n); else if (s === 'exclude') exc.add(n); }
      if (sel.size > 0) machineSelect = sel; else if (exc.size > 0) machineExclude = exc;
    }

    const procAllowed = filters.processFilters.size > 0 ? new Set(resolveTriState(availableProcesses, filters.processFilters)) : null;
    const integrityAllowed = filters.integrityFilters.size > 0 ? new Set(resolveTriState(['Low', 'Medium', 'High', 'System'], filters.integrityFilters)) : null;
    const userAllowed = filters.userFilters.size > 0 ? new Set(resolveTriState(availableUsers, filters.userFilters)) : null;
    const needsParse = procAllowed || integrityAllowed || userAllowed;

    return deferredEvents.filter((e) => {
      // Machine (cheapest check first)
      if (machineSelect && !machineSelect.has(e.machineName)) return false;
      if (machineExclude && machineExclude.has(e.machineName)) return false;

      if (needsParse) {
        const proc = parseProcessCreate(e);  // WeakMap-cached
        const net = parseNetworkConnect(e);
        const file = parseFileCreate(e);

        if (procAllowed) {
          const img = proc?.imageName ?? net?.imageName ?? file?.imageName;
          if (img && !procAllowed.has(img)) return false;
        }
        if (integrityAllowed && e.eventId === 1 && proc?.integrityLevel && !integrityAllowed.has(proc.integrityLevel)) return false;
        if (userAllowed) {
          const user = proc?.user ?? net?.user ?? file?.user;
          if (user && !userAllowed.has(user)) return false;
        }
      }

      return true;
    });
  }, [deferredEvents, filters, availableProcesses, availableUsers]);

  /* ---- Search (separated — only reruns when search/detections change) ---- */
  const filteredEvents = useMemo(
    () => applySearch(dataFiltered, debouncedSearch, COLUMNS, (e) => {
      const sevInfo = sev.getEventSeverity(e);
      return getExtraSearchFields(e, sevInfo ? sevInfo.severity : '');
    }),
    [dataFiltered, debouncedSearch, sev],
  );

  const toggleFilters = useCallback(() => setShowFilters((v) => !v), []);

  /* ---- Severity filter ---- */
  const severityFilteredEvents = useMemo(
    () => sev.filterBySeverity(filteredEvents, filters.severityFilter),
    [filteredEvents, sev, filters.severityFilter],
  );

  /* ---- Render ---- */
  return (
    <VirtualizedEventList
      visible={visible}
      isLoading={isLoading}
      error={!!error}
      loadedCount={loadedCount}
      totalCount={totalCount}
      isComplete={isComplete}
      columns={COLUMNS}
      columnsStorageKey="winstride:sysmonColumns"
      searchPlaceholder="Search... (process:cmd.exe ip:10.0 user:admin)"
      emptyMessage="No events found. Make sure the Agent is collecting Sysmon events."
      eventLabels={SYSMON_EVENT_LABELS}
      eventIdColumnKey="type"
      exportPrefix="winstride-sysmon"
      renderCell={(col, event) => renderSeverityCell(col, event, sev) ?? renderCell(col, event)}
      renderDetailRow={(event) => <SysmonDetailRow event={event} detections={sev.detections.byEventId.get(event.id)} />}
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
      filteredEvents={severityFilteredEvents}
      rawCount={deferredEvents.length}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={sysmonJsonMapper}
      getSortValue={sev.getSortValue}
    />
  );
}
