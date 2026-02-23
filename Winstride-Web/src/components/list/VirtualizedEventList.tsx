import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import type { WinEvent } from '../../modules/security/shared/types';
import {
  type ColumnDef,
  type SortDir,
  sortEvents,
  nextSortDir,
  buildGridTemplate,
  relativeTime,
  loadVisibleColumns,
  saveVisibleColumns,
} from '../../shared/listUtils';
import { exportCSV, exportJSON } from '../../shared/eventExport';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ROW_HEIGHT = 40;
const OVERSCAN = 10;

/* ------------------------------------------------------------------ */
/*  Toolbar button                                                     */
/* ------------------------------------------------------------------ */

export function ToolbarButton({
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
  columns,
  visible,
  onToggle,
}: {
  columns: ColumnDef[];
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
          {columns.map((col) => (
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
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface VirtualizedEventListProps {
  visible: boolean;

  /** Data loading state */
  isLoading: boolean;
  /** Data error state */
  error: boolean;

  /** Column definitions for this module */
  columns: ColumnDef[];
  /** localStorage key for column visibility */
  columnsStorageKey: string;

  /** Search input placeholder */
  searchPlaceholder: string;
  /** Empty state message when no events and no search */
  emptyMessage: string;

  /** Event labels for CSV export (maps eventId -> label) */
  eventLabels: Record<number, string>;
  /** Column key that holds the event ID (for CSV label enrichment) */
  eventIdColumnKey: string;
  /** Prefix for exported file names */
  exportPrefix: string;

  /** Custom cell renderer — return null to use default rendering */
  renderCell?: (col: ColumnDef, event: WinEvent) => React.ReactNode | null;
  /** Detail row component shown when a row is expanded */
  renderDetailRow: (event: WinEvent) => React.ReactNode;

  /** Filter sidebar component */
  renderFilterPanel: () => React.ReactNode;

  /** Show/hide filter sidebar state */
  showFilters: boolean;
  onToggleFilters: () => void;

  /** Sorted+filtered events (after client-side filtering) */
  filteredEvents: WinEvent[];
  /** Total raw events count (for "X / Y" display) */
  rawCount: number;

  /** Client-side search filter (applied by parent) */
  search: string;
  onSearchChange: (value: string) => void;

  /** JSON export mapper function */
  jsonMapper: (event: WinEvent) => Record<string, unknown>;

  /** Optional override for sort values — return undefined to fall back to col.getValue */
  getSortValue?: (columnKey: string, event: WinEvent) => string | number | undefined;

  /** Number of events loaded so far (for progress bar) */
  loadedCount?: number;
  /** Total event count from server (for progress bar) */
  totalCount?: number | null;
  /** Whether all pages have finished loading */
  isComplete?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Default cell renderer                                              */
/* ------------------------------------------------------------------ */

function DefaultCell({ col, event }: { col: ColumnDef; event: WinEvent }) {
  if (col.key === 'time') {
    return (
      <span title={new Date(event.timeCreated).toISOString()}>
        {relativeTime(event.timeCreated)}
      </span>
    );
  }
  return <span className="truncate text-white">{String(col.getValue(event) || '-')}</span>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VirtualizedEventList({
  visible,
  isLoading,
  error,
  columns,
  columnsStorageKey,
  searchPlaceholder,
  emptyMessage,
  eventLabels,
  eventIdColumnKey,
  exportPrefix,
  renderCell,
  renderDetailRow,
  renderFilterPanel,
  showFilters,
  onToggleFilters,
  filteredEvents,
  rawCount,
  search,
  onSearchChange,
  jsonMapper,
  getSortValue,
  loadedCount,
  totalCount,
  isComplete,
}: VirtualizedEventListProps) {
  /* ---- List state ---- */
  const [sortKey, setSortKey] = useState<string>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const defaultVisibleCols = useMemo(
    () => new Set(columns.filter((c) => c.defaultVisible).map((c) => c.key)),
    [columns],
  );
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(columnsStorageKey, defaultVisibleCols),
  );

  useEffect(() => { saveVisibleColumns(columnsStorageKey, visibleColumns); }, [columnsStorageKey, visibleColumns]);

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

  /* ---- Sort ---- */
  // Stabilize getSortValue so detection updates don't trigger re-sort
  // when we're not sorting by severity
  const getSortValueRef = useRef(getSortValue);
  getSortValueRef.current = getSortValue;
  const sortNonce = sortKey === 'severity' ? getSortValue : null;

  const sortedEvents = useMemo(
    () => {
      if (!sortDir) return filteredEvents;
      // Events arrive from server as ORDER BY timeCreated DESC.
      // .filter() preserves order, so skip O(n log n) sort for time column.
      if (sortKey === 'time') {
        return sortDir === 'desc' ? filteredEvents : [...filteredEvents].reverse();
      }
      return sortEvents(filteredEvents, columns, sortKey, sortDir, getSortValueRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredEvents, columns, sortKey, sortDir, sortNonce],
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

  const rafId = useRef(0);
  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
    });
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
    () => columns.filter((c) => visibleColumns.has(c.key)),
    [columns, visibleColumns],
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
              {filteredEvents.length !== rawCount && (
                <span className="text-gray-300"> / {rawCount.toLocaleString()}</span>
              )}
            </span>
          )}
          {isComplete === false && totalCount != null && loadedCount != null && (
            <div className="flex items-center gap-2 text-[11px] text-gray-300 tabular-nums">
              <div className="w-24 h-1.5 bg-[#1c2128] rounded overflow-hidden">
                <div
                  className="h-full bg-[#58a6ff] rounded transition-all duration-300"
                  style={{ width: `${Math.min(100, (loadedCount / totalCount) * 100)}%` }}
                />
              </div>
              <span>{loadedCount.toLocaleString()} / {totalCount.toLocaleString()}</span>
            </div>
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
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8 pr-3 py-1 text-[12px] bg-[#0d1117] border border-[#30363d] rounded-md text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors w-64"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ColumnPicker columns={columns} visible={visibleColumns} onToggle={toggleColumn} />
          <ToolbarButton onClick={() => exportCSV(sortedEvents, columns, visibleColumns, eventLabels, eventIdColumnKey, exportPrefix)}>
            Export CSV
          </ToolbarButton>
          <ToolbarButton onClick={() => exportJSON(sortedEvents, jsonMapper, exportPrefix)}>
            Export JSON
          </ToolbarButton>
          <ToolbarButton onClick={onToggleFilters} active={showFilters}>
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
                {search
                  ? `No events match "${search}"`
                  : emptyMessage}
              </div>
            ) : (
              <div style={{ height: totalHeight, position: 'relative', contain: 'strict' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: startIdx * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    willChange: 'transform',
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
                              {renderCell?.(col, event) ?? <DefaultCell col={col} event={event} />}
                            </div>
                          ))}
                        </div>
                        {isExpanded && renderDetailRow(event)}
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
              {renderFilterPanel()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
