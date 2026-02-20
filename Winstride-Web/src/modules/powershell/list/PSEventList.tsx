import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import { DEFAULT_PS_FILTERS, type PSFilters } from '../shared/filterTypes';
import { loadPSFilters, savePSFilters } from '../shared/filterSerializer';
import { buildPSFilter } from '../shared/buildPSFilter';
import { PS_EVENT_LABELS } from '../shared/eventMeta';
import { parseScriptBlock, parseCommandExecution, findSuspiciousKeywords } from '../shared/parsePSEvent';
import PSFilterPanel from '../PSFilterPanel';
import PSDetailRow from './PSDetailRow';
import type { WinEvent } from '../../security/shared/types';
import { resolveTriState } from '../../security/shared/filterTypes';
import {
  COLUMNS,
  buildGridTemplate,
  sortEvents,
  nextSortDir,
  exportCSV,
  exportJSON,
  relativeTime,
  loadVisibleColumns,
  saveVisibleColumns,
  type SortDir,
  type ColumnDef,
} from './psColumns';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ROW_HEIGHT = 40;
const OVERSCAN = 10;

/* ------------------------------------------------------------------ */
/*  Toolbar button                                                     */
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
      return <span className="truncate text-white">{String(col.getValue(event) || '-')}</span>;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function PSEventList({ visible }: { visible: boolean }) {
  /* ---- Filter state ---- */
  const [filters, setFilters] = useState<PSFilters>(() => loadPSFilters() ?? DEFAULT_PS_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { savePSFilters(filters); }, [filters]);

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

    // Level filter — Warning only (suspicious)
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
            <span className="text-[11px] text-white tabular-nums">
              {filteredEvents.length.toLocaleString()} events
              {filteredEvents.length !== (rawEvents?.length ?? 0) && (
                <span className="text-gray-300"> / {rawEvents?.length.toLocaleString()}</span>
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
              placeholder="Search scripts & commands..."
              className="pl-8 pr-3 py-1 text-[12px] bg-[#0d1117] border border-[#30363d] rounded-md text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors w-64"
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
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overflow-x-hidden gf-scrollbar"
              onScroll={handleScroll}
            >
              {/* Sticky header row */}
              <div
                className="sticky top-0 z-10 bg-[#161b22] border-b border-[#21262d] grid"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {activeCols.map((col) => (
                  <div
                    key={col.key}
                    className={`px-4 py-2.5 text-[11px] font-semibold text-gray-200 uppercase tracking-wider truncate ${
                      col.sortable ? 'cursor-pointer hover:text-gray-200 select-none transition-colors' : ''
                    }`}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    {col.label}
                    {sortKey === col.key && <SortIcon dir={sortDir} />}
                  </div>
                ))}
              </div>

              {/* Body */}
              {sortedEvents.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                  {debouncedSearch
                    ? `No events match "${debouncedSearch}"`
                    : 'No events found. Make sure the Agent is collecting PowerShell events.'}
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
                                className="px-4 text-[12px] text-white truncate"
                              >
                                <CellContent col={col} event={event} />
                              </div>
                            ))}
                          </div>
                          {isExpanded && <PSDetailRow event={event} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
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
              <PSFilterPanel
                filters={filters}
                onFiltersChange={setFilters}
                availableMachines={availableMachines}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
