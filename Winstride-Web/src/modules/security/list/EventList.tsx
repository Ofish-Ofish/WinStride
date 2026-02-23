import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import GraphFilterPanel from '../graph/GraphFilterPanel';
import { DEFAULT_FILTERS, resolveTriState, type GraphFilters } from '../shared/filterTypes';
import { EVENT_LABELS, LOGON_TYPE_LABELS, isSystemAccount, ALL_EVENT_IDS } from '../shared/eventMeta';
import { loadFiltersFromStorage, saveFiltersToStorage } from '../shared/filterSerializer';
import { useModuleEvents } from '../../../shared/hooks/useModuleEvents';
import type { WinEvent } from '../shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { relativeTime, applySearch } from '../../../shared/listUtils';
import EventDetailRow from './EventDetailRow';
import VirtualizedEventList from '../../../components/list/VirtualizedEventList';
import { COLUMNS, parseEventData, securityJsonMapper } from './listColumns';
import { useSeverityIntegration } from '../../../shared/detection/engine';
import { renderSeverityCell } from '../../../shared/detection/SeverityBadge';

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
  const parsed = parseEventData(e);
  return {
    // Risk / severity (from detection engine)
    risk: severityLabel, severity: severityLabel,
    // Fields not exposed as columns
    level: e.level ?? '',
    domain: parsed?.targetDomainName ?? '',
    subject: parsed?.subjectUserName ?? '',
    port: parsed?.ipPort ?? '',
    auth: parsed?.authPackage ?? '', package: parsed?.authPackage ?? '',
    process: parsed?.processName ?? '',
    workstation: parsed?.workstationName ?? '',
    status: `${parsed?.failureStatus ?? ''} ${parsed?.failureSubStatus ?? ''}`,
    failure: `${parsed?.failureStatus ?? ''} ${parsed?.failureSubStatus ?? ''}`,
    elevated: parsed?.elevatedToken ? 'yes' : 'no',
    admin: parsed?.elevatedToken ? 'yes' : 'no',
  };
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

  /* ---- Data fetch ---- */
  const { events: rawEvents, isLoading, error, isComplete, loadedCount, totalCount } = useModuleEvents({
    logName: 'Security',
    allEventIds: ALL_EVENT_IDS,
    eventFilters: filters.eventFilters,
    timeStart: filters.timeStart,
    timeEnd: filters.timeEnd,
  }, { enabled: visible });

  // Defer events so the expensive cascade (detection → filter → sort)
  // runs in a non-blocking render. Progress bar stays immediately responsive.
  const deferredEvents = useDeferredValue(rawEvents);

  const sev = useSeverityIntegration(deferredEvents, 'security');

  /* ---- Available values for filter panel ---- */
  const { availableMachines, availableUsers, availableIps, availableAuthPackages, availableProcesses, availableFailureStatuses } = useMemo(() => {
    if (!deferredEvents) return { availableMachines: [], availableUsers: [], availableIps: [], availableAuthPackages: [], availableProcesses: [], availableFailureStatuses: [] };
    const machines = new Set<string>();
    const users = new Set<string>();
    const ips = new Set<string>();
    const authPkgs = new Set<string>();
    const procs = new Set<string>();
    const failStatuses = new Set<string>();
    for (const e of deferredEvents) {
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
  }, [deferredEvents]);

  /* ---- Client-side filtering (single pass, no sev dependency) ---- */
  const dataFiltered = useMemo(() => {
    if (!deferredEvents) return [];

    // Pre-compute filter sets once
    const logonAllowed = filters.logonTypeFilters.size > 0
      ? new Set(resolveTriState(Object.keys(LOGON_TYPE_LABELS).map(Number), filters.logonTypeFilters))
      : null;

    let machineSelect: Set<string> | null = null;
    let machineExclude: Set<string> | null = null;
    if (filters.machineFilters.size > 0) {
      const sel = new Set<string>(); const exc = new Set<string>();
      for (const [n, s] of filters.machineFilters) { if (s === 'select') sel.add(n); else if (s === 'exclude') exc.add(n); }
      if (sel.size > 0) machineSelect = sel; else if (exc.size > 0) machineExclude = exc;
    }

    let userSelect: Set<string> | null = null;
    let userExclude: Set<string> | null = null;
    if (filters.userFilters.size > 0) {
      const sel = new Set<string>(); const exc = new Set<string>();
      for (const [n, s] of filters.userFilters) { if (s === 'select') sel.add(n); else if (s === 'exclude') exc.add(n); }
      if (sel.size > 0) userSelect = sel; else if (exc.size > 0) userExclude = exc;
    }

    const ipAllowed = filters.ipFilters.size > 0 ? new Set(resolveTriState(availableIps, filters.ipFilters)) : null;
    const authAllowed = filters.authPackageFilters.size > 0 ? new Set(resolveTriState(availableAuthPackages, filters.authPackageFilters)) : null;
    const procAllowed = filters.processFilters.size > 0 ? new Set(resolveTriState(availableProcesses, filters.processFilters)) : null;
    const statusAllowed = filters.failureStatusFilters.size > 0 ? new Set(resolveTriState(availableFailureStatuses, filters.failureStatusFilters)) : null;

    return deferredEvents.filter((e) => {
      // Machine (no parse needed — cheapest check first)
      if (machineSelect && !machineSelect.has(e.machineName)) return false;
      if (machineExclude && machineExclude.has(e.machineName)) return false;

      const parsed = parseEventData(e); // WeakMap-cached

      // Logon type
      if (logonAllowed && parsed && parsed.logonType >= 0 && !logonAllowed.has(parsed.logonType)) return false;
      // Machine accounts
      if (filters.hideMachineAccounts && parsed?.targetUserName && isSystemAccount(parsed.targetUserName)) return false;
      // User
      if (userSelect || userExclude) {
        const u = parsed?.targetUserName;
        if (u) {
          if (userSelect && !userSelect.has(u)) return false;
          if (userExclude && userExclude.has(u)) return false;
        }
      }
      // IP
      if (ipAllowed && parsed?.ipAddress && parsed.ipAddress !== '-' && !ipAllowed.has(parsed.ipAddress)) return false;
      // Auth package
      if (authAllowed && parsed?.authPackage && !authAllowed.has(parsed.authPackage)) return false;
      // Process
      if (procAllowed && parsed?.processName && parsed.processName !== '-' && !procAllowed.has(parsed.processName)) return false;
      // Failure status
      if (statusAllowed && parsed) {
        const hasStatus = (parsed.failureStatus && parsed.failureStatus !== '0x0') || (parsed.failureSubStatus && parsed.failureSubStatus !== '0x0');
        if (hasStatus && !statusAllowed.has(parsed.failureStatus) && !statusAllowed.has(parsed.failureSubStatus)) return false;
      }
      // Elevated only — 4672 (special privileges assigned) always counts as elevated
      if (filters.showElevatedOnly && !parsed?.elevatedToken && e.eventId !== 4672) return false;

      return true;
    });
  }, [deferredEvents, filters, availableIps, availableAuthPackages, availableProcesses, availableFailureStatuses]);

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
    () => sev.filterBySeverity(filteredEvents, filters.minSeverity, filters.hideUndetected),
    [filteredEvents, sev, filters.minSeverity, filters.hideUndetected],
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
      columnsStorageKey="winstride:listColumns"
      searchPlaceholder="Search... (ip:192.168 user:admin)"
      emptyMessage="No events found. Make sure the Agent is collecting Security events."
      eventLabels={EVENT_LABELS}
      eventIdColumnKey="eventId"
      exportPrefix="winstride-events"
      renderCell={(col, event) => renderSeverityCell(col, event, sev) ?? renderCell(col, event)}
      renderDetailRow={(event) => <EventDetailRow event={event} detections={sev.detections.byEventId.get(event.id)} />}
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
        />
      )}
      showFilters={showFilters}
      onToggleFilters={toggleFilters}
      filteredEvents={severityFilteredEvents}
      rawCount={deferredEvents.length}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={securityJsonMapper}
      getSortValue={sev.getSortValue}
    />
  );
}
