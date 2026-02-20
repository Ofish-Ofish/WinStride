import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import { DEFAULT_PS_FILTERS, type PSFilters } from '../shared/filterTypes';
import { loadPSFilters, savePSFilters } from '../shared/filterSerializer';
import { buildPSFilter } from '../shared/buildPSFilter';
import { PS_EVENT_LABELS } from '../shared/eventMeta';
import { parseScriptBlock, parseCommandExecution } from '../shared/parsePSEvent';
import PSFilterPanel from '../PSFilterPanel';
import PSDetailRow from './PSDetailRow';
import type { WinEvent } from '../../security/shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { relativeTime } from '../../../shared/listUtils';
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

  /* ---- OData filter ---- */
  const odataFilter = useMemo(
    () => buildPSFilter(filters),
    [filters.eventFilters, filters.timeStart, filters.timeEnd],
  );

  /* ---- Data fetch ---- */
  const { data: rawEvents, isLoading, error } = useQuery<WinEvent[]>({
    queryKey: ['events', 'powershell-list', odataFilter],
    queryFn: () => fetchEvents({
      $filter: odataFilter,
      $select: 'id,eventId,level,machineName,timeCreated,eventData',
      $orderby: 'timeCreated desc',
    }),
    refetchInterval: 30_000,
    enabled: visible,
  });

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

    // Search
    if (debouncedSearch) {
      const lowerSearch = debouncedSearch.toLowerCase();
      events = events.filter((e) => {
        const sb = parseScriptBlock(e);
        const cmd = parseCommandExecution(e);
        const searchable = [
          String(e.eventId),
          PS_EVENT_LABELS[e.eventId] ?? '',
          e.level ?? '',
          e.machineName,
          sb?.scriptBlockText ?? '',
          sb?.path ?? '',
          cmd?.commandName ?? '',
          cmd?.scriptName ?? '',
          cmd?.payload ?? '',
        ].join(' ').toLowerCase();
        return searchable.includes(lowerSearch);
      });
    }

    return events;
  }, [rawEvents, filters, debouncedSearch]);

  const toggleFilters = useCallback(() => setShowFilters((v) => !v), []);

  /* ---- Render ---- */
  return (
    <VirtualizedEventList
      visible={visible}
      isLoading={isLoading}
      error={!!error}
      columns={COLUMNS}
      columnsStorageKey="winstride:psColumns"
      searchPlaceholder="Search scripts & commands..."
      emptyMessage="No events found. Make sure the Agent is collecting PowerShell events."
      eventLabels={PS_EVENT_LABELS}
      eventIdColumnKey="eventId"
      exportPrefix="winstride-powershell"
      renderCell={renderCell}
      renderDetailRow={(event) => <PSDetailRow event={event} />}
      renderFilterPanel={() => (
        <PSFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          availableMachines={availableMachines}
        />
      )}
      showFilters={showFilters}
      onToggleFilters={toggleFilters}
      filteredEvents={filteredEvents}
      rawCount={rawEvents?.length ?? 0}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={psJsonMapper}
    />
  );
}
