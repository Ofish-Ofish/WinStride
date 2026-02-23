import { useState, useMemo, useEffect, useCallback } from 'react';
import { DEFAULT_PS_FILTERS, type PSFilters } from '../shared/filterTypes';
import { loadPSFilters, savePSFilters } from '../shared/filterSerializer';
import { PS_EVENT_LABELS, PS_EVENT_IDS } from '../shared/eventMeta';
import { useModuleEvents } from '../../../shared/hooks/useModuleEvents';
import { parseScriptBlock, parseCommandExecution } from '../shared/parsePSEvent';
import PSFilterPanel from '../PSFilterPanel';
import PSDetailRow from './PSDetailRow';
import { useSeverityIntegration } from '../../../shared/detection/engine';
import { renderSeverityCell } from '../../../shared/detection/SeverityBadge';
import type { WinEvent } from '../../security/shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { relativeTime, applySearch } from '../../../shared/listUtils';
import VirtualizedEventList from '../../../components/list/VirtualizedEventList';
import { COLUMNS, psJsonMapper } from './psColumns';

/* ------------------------------------------------------------------ */
/*  Level badge                                                        */
/* ------------------------------------------------------------------ */

function LevelBadge({ level, isSuspicious }: { level: string | null; isSuspicious: boolean }) {
  if (isSuspicious || level === 'Warning') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[#f0883e]/20 text-[#f0a050]">
        Suspicious
      </span>
    );
  }
  if (!level) return <span className="text-gray-400">-</span>;
  return <span className="text-blue-300">{level}</span>;
}

/* ------------------------------------------------------------------ */
/*  Cell renderer                                                      */
/* ------------------------------------------------------------------ */

function renderCell(col: ColumnDef, event: WinEvent): React.ReactNode | null {
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
    default:
      return null; // use default
  }
}

/* ------------------------------------------------------------------ */
/*  Extra search fields (fields not in column definitions)             */
/* ------------------------------------------------------------------ */

function getExtraSearchFields(e: WinEvent, severityLabel: string): Record<string, string> {
  const cmd = parseCommandExecution(e);
  return {
    risk: severityLabel, severity: severityLabel,
    level: e.level ?? '',
    payload: cmd?.payload ?? '',
  };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function PSEventList({ visible }: { visible: boolean }) {
  /* ---- Filter state ---- */
  const [filters, setFilters] = useState<PSFilters>(() => loadPSFilters() ?? DEFAULT_PS_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

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
  });

  const sev = useSeverityIntegration(rawEvents, 'powershell');

  /* ---- Available values for filter panel ---- */
  const availableMachines = useMemo(() => {
    if (!rawEvents) return [];
    const machines = new Set<string>();
    for (const e of rawEvents) machines.add(e.machineName);
    return [...machines].sort();
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

    // Level filter
    if (filters.levelFilter === 'warning-only') {
      events = events.filter((e) => e.level === 'Warning');
    }

    // Search — column-driven field:value + plain text
    events = applySearch(events, debouncedSearch, COLUMNS, (e) => {
      const sevInfo = sev.getEventSeverity(e);
      return getExtraSearchFields(e, sevInfo ? sevInfo.severity : '');
    });

    return events;
  }, [rawEvents, filters, debouncedSearch, sev]);

  const toggleFilters = useCallback(() => setShowFilters((v) => !v), []);

  /* ---- Severity filter ---- */
  const severityFilteredEvents = useMemo(
    () => sev.filterBySeverity(filteredEvents, filters.minSeverity),
    [filteredEvents, sev, filters.minSeverity],
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
      columnsStorageKey="winstride:psColumns"
      searchPlaceholder="Search... (command:Invoke path:temp level:Warning)"
      emptyMessage="No events found. Make sure the Agent is collecting PowerShell events."
      eventLabels={PS_EVENT_LABELS}
      eventIdColumnKey="eventId"
      exportPrefix="winstride-powershell"
      renderCell={(col, event) => renderSeverityCell(col, event, sev) ?? renderCell(col, event)}
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
      rawCount={rawEvents?.length ?? 0}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={psJsonMapper}
      getSortValue={sev.getSortValue}
    />
  );
}
