import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_PS_FILTERS, type PSFilters } from '../shared/filterTypes';
import { loadPSFilters, savePSFilters } from '../shared/filterSerializer';
import { PS_EVENT_LABELS, PS_EVENT_IDS } from '../shared/eventMeta';
import { useModuleEvents } from '../../../shared/hooks/useModuleEvents';
import { parseScriptBlock, parseCommandExecution } from '../shared/parsePSEvent';
import PSFilterPanel from '../PSFilterPanel';
import PSDetailRow from './PSDetailRow';
import { useSeverityIntegration } from '../../../shared/detection/engine';
import { renderSeverityCell } from '../../../shared/detection/SeverityBadge';
import type { ColumnDef } from '../../../shared/listUtils';
import { relativeTime, applySearch } from '../../../shared/listUtils';
import VirtualizedEventList from '../../../components/list/VirtualizedEventList';
import { COLUMNS, psJsonMapper } from './psColumns';
import type { PSEnrichedEvent } from '../shared/types';
import type { WinEvent } from '../../security/shared/types';
import type { FilterState } from '../../../components/filter/filterPrimitives';
import {
  buildPowerShellCommandIndex,
  buildSysmonProcessIndex,
  correlatePowerShellToCommandContext,
  correlatePowerShellToSysmon,
  getPowerShellPid,
} from '../../../shared/correlation/powershellSysmon';

/* ------------------------------------------------------------------ */
/*  Level badge                                                        */
/* ------------------------------------------------------------------ */

function LevelBadge({ level, isSuspicious }: { level: string | null; isSuspicious: boolean }) {
  if (isSuspicious || level === 'Warning') {
    return (
      <span className="flex items-center">
        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[#f0883e]/20 text-[#f0a050]">
          Suspicious
        </span>
      </span>
    );
  }
  if (!level) return <span className="text-gray-400">-</span>;
  return <span className="text-blue-300">{level}</span>;
}

/* ------------------------------------------------------------------ */
/*  Cell renderer                                                      */
/* ------------------------------------------------------------------ */

function renderCell(col: ColumnDef<PSEnrichedEvent>, event: PSEnrichedEvent): React.ReactNode | null {
  switch (col.key) {
    case 'eventId': {
      const label = PS_EVENT_LABELS[event.eventId];
      return (
        <span className="flex items-center gap-2">
          <span className="font-mono">{event.eventId}</span>
          {label && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${
              event.eventId === 4104
                ? 'bg-[#8b5cf6]/20 text-[#a78bfa]'
                : 'bg-[#58a6ff]/15 text-[#79c0ff]'
            }`}>
              {label}
            </span>
          )}
        </span>
      );
    }
    case 'level': {
      const sb = event.eventId === 4104 ? parseScriptBlock(event) : null;
      return <LevelBadge level={event.level} isSuspicious={sb?.isSuspicious ?? false} />;
    }
    case 'time':
      return (
        <span title={new Date(event.timeCreated).toISOString()}>
          {relativeTime(event.timeCreated)}
        </span>
      );
    case 'process':
      return event.correlatedProcessName || event.correlatedHostApplication || <span className="text-gray-400">-</span>;
    case 'user':
      return event.correlatedUser || <span className="text-gray-400">-</span>;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Extra search fields (fields not in column definitions)             */
/* ------------------------------------------------------------------ */

function getExtraSearchFields(e: PSEnrichedEvent, severityLabel: string): Record<string, string> {
  const cmd = parseCommandExecution(e);
  return {
    risk: severityLabel,
    severity: severityLabel,
    pid: e.correlatedPid != null ? String(e.correlatedPid) : '',
    level: e.level ?? '',
    payload: cmd?.payload ?? '',
    process: e.correlatedProcessName,
    user: e.correlatedUser,
    hostapp: e.correlatedHostApplication,
    image: e.correlatedProcessPath,
    source: e.correlationSource,
  };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function PSEventList({ visible }: { visible: boolean }) {
  const [searchParams] = useSearchParams();

  /* ---- Filter state ---- */
  const [filters, setFilters] = useState<PSFilters>(() => loadPSFilters() ?? DEFAULT_PS_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const initialSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  useEffect(() => { savePSFilters(filters); }, [filters]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  /* ---- Data fetch ---- */
  const { events: rawEvents, isLoading, error, isComplete, loadedCount, totalCount } = useModuleEvents({
    logName: 'Microsoft-Windows-PowerShell/Operational',
    allEventIds: PS_EVENT_IDS,
    eventFilters: filters.eventFilters,
    timeStart: filters.timeStart,
    timeEnd: filters.timeEnd,
  }, { enabled: visible });

  const sysmonProcessEventsSelected = useMemo(
    () => new Map<number, FilterState>([[1, 'select']]),
    [],
  );
  const { events: sysmonProcessEvents } = useModuleEvents({
    logName: 'Microsoft-Windows-Sysmon/Operational',
    allEventIds: [1],
    eventFilters: sysmonProcessEventsSelected,
    timeStart: filters.timeStart,
    timeEnd: filters.timeEnd,
  }, { enabled: visible });

  const deferredEvents = useDeferredValue(rawEvents);
  const powerShellCommandIndex = useMemo(
    () => buildPowerShellCommandIndex(deferredEvents),
    [deferredEvents],
  );
  const sysmonProcessIndex = useMemo(
    () => buildSysmonProcessIndex(sysmonProcessEvents),
    [sysmonProcessEvents],
  );

  const enrichedEvents = useMemo<PSEnrichedEvent[]>(() => deferredEvents.map((event) => {
    const cmd = parseCommandExecution(event);
    const psContext = cmd ? null : correlatePowerShellToCommandContext(event, powerShellCommandIndex);
    const match = correlatePowerShellToSysmon(event, sysmonProcessIndex);
    const correlatedUser = cmd?.user || psContext?.parsed.user || match?.parsed.user || '';
    const correlatedHostApplication = cmd?.hostApplication || psContext?.parsed.hostApplication || '';
    const hasPowerShellContext = Boolean(correlatedUser || correlatedHostApplication);

    return {
      ...event,
      correlatedPid: getPowerShellPid(event),
      correlatedProcessName: match?.parsed.imageName ?? '',
      correlatedProcessPath: match?.parsed.image ?? '',
      correlatedUser,
      correlatedHostApplication,
      correlatedCommandLine: match?.parsed.commandLine ?? '',
      correlatedParentImage: match?.parsed.parentImage ?? '',
      correlatedLogonId: match?.parsed.logonId ?? '',
      correlatedSysmonTime: match?.event.timeCreated ?? '',
      correlationSource: hasPowerShellContext
        ? (match ? 'powershell+sysmon' : 'powershell')
        : (match ? 'sysmon' : 'none'),
    };
  }), [deferredEvents, powerShellCommandIndex, sysmonProcessIndex]);

  const sev = useSeverityIntegration(enrichedEvents, 'powershell');

  /* ---- Available values for filter panel ---- */
  const availableMachines = useMemo(() => {
    const machines = new Set<string>();
    for (const e of enrichedEvents) machines.add(e.machineName);
    return [...machines].sort();
  }, [enrichedEvents]);

  /* ---- Client-side filtering (no sev dependency) ---- */
  const dataFiltered = useMemo(() => {
    let events = enrichedEvents;

    if (filters.machineFilters.size > 0) {
      let machineSelect: Set<string> | null = null;
      let machineExclude: Set<string> | null = null;
      const sel = new Set<string>();
      const exc = new Set<string>();
      for (const [name, state] of filters.machineFilters) {
        if (state === 'select') sel.add(name);
        else if (state === 'exclude') exc.add(name);
      }
      if (sel.size > 0) machineSelect = sel;
      else if (exc.size > 0) machineExclude = exc;

      if (machineSelect) events = events.filter((e) => machineSelect!.has(e.machineName));
      else if (machineExclude) events = events.filter((e) => !machineExclude!.has(e.machineName));
    }

    if (filters.levelFilter === 'warning-only') {
      events = events.filter((e) => e.level === 'Warning');
    }

    return events;
  }, [enrichedEvents, filters]);

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
    () => sev.filterBySeverity(filteredEvents, filters.severityFilter) as PSEnrichedEvent[],
    [filteredEvents, sev, filters.severityFilter],
  );

  /* ---- Render ---- */
  return (
    <VirtualizedEventList<PSEnrichedEvent>
      visible={visible}
      isLoading={isLoading}
      error={!!error}
      loadedCount={loadedCount}
      totalCount={totalCount}
      isComplete={isComplete}
      columns={COLUMNS}
      columnsStorageKey="winstride:psColumns"
      searchPlaceholder="Search... (command:Invoke user:admin process:pwsh pid:1234)"
      emptyMessage="No events found. Make sure the Agent is collecting PowerShell events."
      csvEnrichment={(col, e) => {
        if (col.key === 'eventId') {
          const label = PS_EVENT_LABELS[e.eventId];
          return label ? `${e.eventId} ${label}` : undefined;
        }
        if (col.key === 'time') return new Date(e.timeCreated).toISOString();
        return undefined;
      }}
      exportPrefix="winstride-powershell"
      renderCell={(col, event) => renderSeverityCell(col as ColumnDef<WinEvent>, event, sev) ?? renderCell(col, event)}
      renderDetailRow={(event) => <PSDetailRow event={event} detections={sev.detections.byEventId.get(event.id)} />}
      renderFilterPanel={() => (
        <PSFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          availableMachines={availableMachines}
        />
      )}
      showFilters={showFilters}
      onToggleFilters={toggleFilters}
      filteredEvents={severityFilteredEvents}
      rawCount={enrichedEvents.length}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={psJsonMapper}
      getSortValue={sev.getSortValue}
    />
  );
}
