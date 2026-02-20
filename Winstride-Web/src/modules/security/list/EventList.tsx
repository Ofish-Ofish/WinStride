import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import GraphFilterPanel from '../graph/GraphFilterPanel';
import { DEFAULT_FILTERS, resolveTriState, type GraphFilters } from '../shared/filterTypes';
import { EVENT_LABELS, LOGON_TYPE_LABELS, isSystemAccount } from '../shared/eventMeta';
import { loadFiltersFromStorage, saveFiltersToStorage } from '../shared/filterSerializer';
import { buildODataFilter } from '../shared/buildODataFilter';
import type { WinEvent } from '../shared/types';
import EventDetailRow from './EventDetailRow';
import {
  COLUMNS,
  buildGridTemplate,
  sortEvents,
  nextSortDir,
  exportCSV,
  exportJSON,
  parseEventData,
  relativeTime,
  loadVisibleColumns,
  saveVisibleColumns,
  type SortDir,
  type ColumnDef,
} from './listColumns';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ROW_HEIGHT = 40;
const OVERSCAN = 10;

/* ------------------------------------------------------------------ */
/*  Toolbar button (matches graph view style)                          */
/* ------------------------------------------------------------------ */

function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] rounded-md border transition-all duration-150 ${
        active
          ? 'text-[#58a6ff] bg-[#58a6ff]/10 border-[#58a6ff]/40'
          : 'text-gray-400 hover:text-gray-200 bg-[#161b22] hover:bg-[#1c2128] border-[#30363d]'
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Column visibility dropdown                                         */
/* ------------------------------------------------------------------ */

function ColumnPicker({
  visible,
  onToggle,
}: {
  visible: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton onClick={() => setOpen(!open)} active={open}>
        Columns
      </ToolbarButton>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl py-1 min-w-[160px]">
          {COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#1c2128] cursor-pointer text-[12px] text-gray-300"
            >
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={() => onToggle(col.key)}
                className="accent-[#58a6ff]"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Level badge                                                        */
/* ------------------------------------------------------------------ */

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-gray-600">-</span>;
  const colors: Record<string, string> = {
    Information: 'text-blue-400',
    Warning: 'text-yellow-400',
    Error: 'text-red-400',
    Critical: 'text-red-500',
  };
  return <span className={colors[level] ?? 'text-gray-400'}>{level}</span>;
}

/* ------------------------------------------------------------------ */
/*  Sort indicator                                                     */
/* ------------------------------------------------------------------ */

function SortIcon({ dir }: { dir: SortDir }) {
  if (!dir) return null;
  return (
    <span className="ml-1 text-[#58a6ff]">
      {dir === 'asc' ? '\u25B2' : '\u25BC'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Cell renderer                                                      */
/* ------------------------------------------------------------------ */

function CellContent({ col, event }: { col: ColumnDef; event: WinEvent }) {
  switch (col.key) {
    case 'eventId': {
      const label = EVENT_LABELS[event.eventId];
      return (
        <span className="flex items-center gap-2">
          <span className="font-mono">{event.eventId}</span>
          {label && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
              event.eventId === 4625
                ? 'bg-[#f85149]/15 text-[#f85149]'
                : event.eventId === 4624
                  ? 'bg-[#3fb950]/15 text-[#3fb950]'
                  : event.eventId === 4672
                    ? 'bg-[#f0883e]/15 text-[#f0883e]'
                    : 'bg-[#58a6ff]/10 text-[#58a6ff]'
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
      return <span className="truncate">{String(col.getValue(event) || '-')}</span>;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function EventList({ visible }: { visible: boolean }) {
  /* ---- Filter state (shared with graph view) ---- */
  const [filters, setFilters] = useState<GraphFilters>(() => loadFiltersFromStorage() ?? DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { saveFiltersToStorage(filters); }, [filters]);

  /* ---- List state ---- */
  const [sortKey, setSortKey] = useState<string>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => loadVisibleColumns());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { saveVisibleColumns(visibleColumns); }, [visibleColumns]);

  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ---- Resize handle for filter sidebar ---- */
  const [panelWidth, setPanelWidth] = useState(() => Math.round(window.innerWidth / 2));
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.min(1000, Math.max(260, startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

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

  /* ---- Client-side filtering ---- */
  const filteredEvents = useMemo(() => {
    if (!rawEvents) return [];
    let events = rawEvents;

    if (filters.logonTypeFilters.size > 0) {
      const allLogonTypes = Object.keys(LOGON_TYPE_LABELS).map(Number);
      const allowed = new Set(resolveTriState(allLogonTypes, filters.logonTypeFilters));
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        if (!parsed || parsed.logonType < 0) return true;
        return allowed.has(parsed.logonType);
      });
    }

    if (filters.hideMachineAccounts) {
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        if (!parsed || !parsed.targetUserName) return true;
        return !isSystemAccount(parsed.targetUserName);
      });
    }

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

    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      events = events.filter((e) => {
        const parsed = parseEventData(e);
        const label = EVENT_LABELS[e.eventId] ?? '';
        const searchable = [
          String(e.eventId),
          label,
          e.level ?? '',
          parsed?.targetUserName ?? '',
          e.machineName,
          parsed?.logonTypeLabel ?? '',
          parsed?.ipAddress ?? '',
          e.timeCreated,
        ].join(' ').toLowerCase();
        return searchable.includes(lower);
      });
    }

    return events;
  }, [rawEvents, filters.logonTypeFilters, filters.hideMachineAccounts, filters.machineFilters, filters.userFilters, debouncedSearch]);

  /* ---- Available machines/users for filter panel ---- */
  const availableMachines = useMemo(() => {
    if (!rawEvents) return [];
    return [...new Set(rawEvents.map((e) => e.machineName))].sort();
  }, [rawEvents]);

  const availableUsers = useMemo(() => {
    if (!rawEvents) return [];
    const users = new Set<string>();
    for (const e of rawEvents) {
      const parsed = parseEventData(e);
      if (parsed?.targetUserName) users.add(parsed.targetUserName);
    }
    return [...users].sort();
  }, [rawEvents]);

  const maxActivity = 50;

  /* ---- Sort ---- */
  const sortedEvents = useMemo(
    () => sortEvents(filteredEvents, sortKey, sortDir),
    [filteredEvents, sortKey, sortDir],
  );

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => nextSortDir(d));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  /* ---- Virtualization ---- */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  const totalHeight = sortedEvents.length * ROW_HEIGHT;
  // When container hasn't been measured yet, render all rows (no virtualization)
  const shouldVirtualize = containerHeight > 0;
  const startIdx = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const endIdx = shouldVirtualize
    ? Math.min(sortedEvents.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN)
    : sortedEvents.length;
  const visibleEvents = sortedEvents.slice(startIdx, endIdx);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* ---- Active columns + grid template ---- */
  const activeCols = useMemo(
    () => COLUMNS.filter((c) => visibleColumns.has(c.key)),
    [visibleColumns],
  );

  const gridTemplate = useMemo(() => buildGridTemplate(activeCols), [activeCols]);

  /* ---- Render ---- */
  if (!visible) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-shrink-0 mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          {!isLoading && !error && (
            <span className="text-[11px] text-gray-500 tabular-nums">
              {filteredEvents.length.toLocaleString()} events
              {filteredEvents.length !== (rawEvents?.length ?? 0) && (
                <span className="text-gray-600"> / {rawEvents?.length.toLocaleString()}</span>
              )}
            </span>
          )}
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3.5 3.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events..."
              className="pl-8 pr-3 py-1 text-[12px] bg-[#0d1117] border border-[#30363d] rounded-md text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors w-52"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ColumnPicker visible={visibleColumns} onToggle={toggleColumn} />
          <ToolbarButton onClick={() => exportCSV(sortedEvents, visibleColumns)}>
            Export CSV
          </ToolbarButton>
          <ToolbarButton onClick={() => exportJSON(sortedEvents)}>
            Export JSON
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowFilters(!showFilters)} active={showFilters}>
            Filters
          </ToolbarButton>
          {scrollTop > 200 && (
            <ToolbarButton onClick={scrollToTop}>
              Top
            </ToolbarButton>
          )}
        </div>
      </div>

      {/* Main area: table + filter sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Table container */}
        <div className="flex-1 min-w-0 flex flex-col rounded-lg border border-[#21262d] overflow-hidden bg-[#0d1117]">
          {isLoading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-3 text-gray-500 text-sm">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
                Loading events...
              </div>
            </div>
          )}
          {error && (
            <div className="flex-1 flex items-center justify-center text-red-400/80 text-sm">
              Error loading events
            </div>
          )}
          {!isLoading && !error && (
            <>
              {/* Header row */}
              <div
                className="flex-shrink-0 bg-[#161b22] border-b border-[#21262d] grid"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {activeCols.map((col) => (
                  <div
                    key={col.key}
                    className={`px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider truncate ${
                      col.sortable ? 'cursor-pointer hover:text-gray-200 select-none transition-colors' : ''
                    }`}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    {col.label}
                    {sortKey === col.key && <SortIcon dir={sortDir} />}
                  </div>
                ))}
              </div>

              {/* Scrollable body */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overflow-x-hidden gf-scrollbar"
                onScroll={handleScroll}
              >
                {sortedEvents.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-600 text-sm">
                    {debouncedSearch
                      ? `No events match "${debouncedSearch}"`
                      : 'No events found. Make sure the Agent is collecting Security events.'}
                  </div>
                ) : (
                  <div style={{ height: totalHeight, position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: startIdx * ROW_HEIGHT,
                        left: 0,
                        right: 0,
                      }}
                    >
                      {visibleEvents.map((event) => {
                        const isExpanded = expandedId === event.id;
                        return (
                          <div key={event.id}>
                            <div
                              onClick={() => setExpandedId(isExpanded ? null : event.id)}
                              className={`grid cursor-pointer border-t border-[#21262d]/50 transition-colors ${
                                isExpanded ? 'bg-[#161b22]' : 'hover:bg-[#161b22]/60'
                              }`}
                              style={{
                                gridTemplateColumns: gridTemplate,
                                height: ROW_HEIGHT,
                                alignItems: 'center',
                              }}
                            >
                              {activeCols.map((col) => (
                                <div
                                  key={col.key}
                                  className="px-4 text-[12px] text-gray-300 truncate"
                                >
                                  <CellContent col={col} event={event} />
                                </div>
                              ))}
                            </div>
                            {isExpanded && <EventDetailRow event={event} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Resize handle + Filter sidebar */}
        {showFilters && (
          <>
            <div
              onMouseDown={onResizeStart}
              className="w-1.5 flex-shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-[#58a6ff]/10 transition-colors"
            >
              <div className="w-[3px] h-10 rounded-full bg-[#30363d] group-hover:bg-[#58a6ff]/60 transition-colors" />
            </div>
            <div
              className="flex-shrink-0 overflow-y-auto gf-scrollbar self-stretch"
              style={{ width: panelWidth, maxHeight: '100%' }}
            >
              <GraphFilterPanel
                filters={filters}
                onFiltersChange={setFilters}
                availableMachines={availableMachines}
                availableUsers={availableUsers}
                maxActivity={maxActivity}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
