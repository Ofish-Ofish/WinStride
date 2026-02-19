import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import { transformEvents, isSystemAccount, LOGON_TYPE_LABELS } from './transformEvents';
import { useCytoscape } from './useCytoscape';
import NodeDetailPanel from './NodeDetailPanel';
import GraphFilterPanel, { DEFAULT_FILTERS, ALL_EVENT_IDS, resolveTriState, type GraphFilters } from './GraphFilterPanel';
import { loadFiltersFromStorage, saveFiltersToStorage } from './filterSerializer';
import type { WinEvent } from '../types';

function Legend() {
  return (
    <div className="flex items-center gap-5 text-[11px] text-gray-400">
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-[#3b82f6] inline-block" />
        User
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rotate-45 bg-[#f85149] inline-block" />
        Privileged
      </span>
      <span className="flex items-center gap-2">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
          <rect x="0" y="0" width="24" height="24" rx="4" fill="#3fb950" />
          <rect x="5" y="5" width="6" height="6" rx="0.5" fill="white" opacity="0.4" />
          <rect x="13" y="5" width="6" height="6" rx="0.5" fill="white" opacity="0.4" />
          <rect x="5" y="13" width="6" height="6" rx="0.5" fill="white" opacity="0.4" />
          <rect x="13" y="13" width="6" height="6" rx="0.5" fill="white" opacity="0.4" />
        </svg>
        Machine
      </span>
    </div>
  );
}

function ToolbarButton({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
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

function buildODataFilter(filters: GraphFilters): string {
  const parts: string[] = ["logName eq 'Security'"];

  const effectiveEventIds = resolveTriState(ALL_EVENT_IDS, filters.eventFilters);
  if (effectiveEventIds.length > 0) {
    const orClauses = effectiveEventIds.map((id) => `eventId eq ${id}`).join(' or ');
    parts.push(`(${orClauses})`);
  } else {
    // All events excluded — return nothing from server
    parts.push('eventId eq -1');
  }

  if (filters.timeStart) {
    const iso = new Date(filters.timeStart).toISOString().replace('Z', '+00:00');
    parts.push(`timeCreated gt ${iso}`);
  }
  if (filters.timeEnd) {
    const iso = new Date(filters.timeEnd).toISOString().replace('Z', '+00:00');
    parts.push(`timeCreated lt ${iso}`);
  }

  return parts.join(' and ');
}

export default function LogonGraph({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState<GraphFilters>(() => loadFiltersFromStorage() ?? DEFAULT_FILTERS);
  const [panelWidth, setPanelWidth] = useState(() => Math.round(window.innerWidth / 2));

  // Persist filters to localStorage on every change
  useEffect(() => { saveFiltersToStorage(filters); }, [filters]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX; // dragging left = wider panel
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

  const odataFilter = useMemo(() => buildODataFilter(filters), [filters.eventFilters, filters.timeStart, filters.timeEnd]);

  const { data: events, isLoading, error } = useQuery<WinEvent[]>({
    queryKey: ['events', 'security-graph', odataFilter],
    queryFn: () => fetchEvents({ $filter: odataFilter }),
    refetchInterval: 30000,
  });

  // Step 1: transform raw events into nodes & edges
  const fullGraph = useMemo(() => {
    if (!events) return { nodes: [], edges: [] };
    return transformEvents(events);
  }, [events]);

  // Extract available machines and users for the filter panel
  const availableMachines = useMemo(
    () => fullGraph.nodes.filter((n) => n.type === 'machine').map((n) => n.label).sort(),
    [fullGraph.nodes],
  );

  const availableUsers = useMemo(
    () => fullGraph.nodes.filter((n) => n.type === 'user').map((n) => n.label).sort(),
    [fullGraph.nodes],
  );

  // Calculate max activity across all edges for the slider range
  const maxActivity = useMemo(() => {
    if (fullGraph.edges.length === 0) return 50;
    return Math.max(...fullGraph.edges.map((e) => e.logonCount));
  }, [fullGraph.edges]);

  // Step 2: apply client-side filters
  const { nodes, edges } = useMemo(() => {
    let { nodes, edges } = fullGraph;

    // Apply machine tri-state filters (select = whitelist, exclude = blacklist)
    if (filters.machineFilters.size > 0) {
      const selected = new Set<string>();
      const excluded = new Set<string>();
      for (const [name, state] of filters.machineFilters) {
        if (state === 'select') selected.add(name);
        else if (state === 'exclude') excluded.add(name);
      }
      const prevNodeIds = new Set(nodes.filter((n) => n.type === 'machine').map((n) => n.id));
      if (selected.size > 0) {
        nodes = nodes.filter((n) => n.type !== 'machine' || selected.has(n.label));
      } else if (excluded.size > 0) {
        nodes = nodes.filter((n) => n.type !== 'machine' || !excluded.has(n.label));
      }
      const keptIds = new Set(nodes.filter((n) => n.type === 'machine').map((n) => n.id));
      const removedIds = new Set([...prevNodeIds].filter((id) => !keptIds.has(id)));
      if (removedIds.size > 0) {
        edges = edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target));
      }
    }

    // Apply user tri-state filters (select = whitelist, exclude = blacklist)
    if (filters.userFilters.size > 0) {
      const selected = new Set<string>();
      const excluded = new Set<string>();
      for (const [name, state] of filters.userFilters) {
        if (state === 'select') selected.add(name);
        else if (state === 'exclude') excluded.add(name);
      }
      const prevNodeIds = new Set(nodes.filter((n) => n.type === 'user').map((n) => n.id));
      if (selected.size > 0) {
        nodes = nodes.filter((n) => n.type !== 'user' || selected.has(n.label));
      } else if (excluded.size > 0) {
        nodes = nodes.filter((n) => n.type !== 'user' || !excluded.has(n.label));
      }
      const keptIds = new Set(nodes.filter((n) => n.type === 'user').map((n) => n.id));
      const removedIds = new Set([...prevNodeIds].filter((id) => !keptIds.has(id)));
      if (removedIds.size > 0) {
        edges = edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target));
      }
    }

    // Filter edges by logon type (tri-state: select = whitelist, exclude = blacklist, off = show all)
    const allLogonTypes = Object.keys(LOGON_TYPE_LABELS).map(Number);
    const allowedLogonTypes = new Set(resolveTriState(allLogonTypes, filters.logonTypeFilters));
    edges = edges.filter((e) => e.logonType < 0 || allowedLogonTypes.has(e.logonType));

    // Hide machine/system accounts
    if (filters.hideMachineAccounts) {
      const systemAccountIds = new Set(
        nodes.filter((n) => n.type === 'user' && isSystemAccount(n.label)).map((n) => n.id),
      );
      nodes = nodes.filter((n) => !systemAccountIds.has(n.id));
      edges = edges.filter((e) => !systemAccountIds.has(e.source) && !systemAccountIds.has(e.target));
    }

    // Filter by activity range
    edges = edges.filter((e) =>
      e.logonCount >= filters.activityMin &&
      (filters.activityMax === Infinity || e.logonCount <= filters.activityMax)
    );

    // Remove orphaned nodes (no remaining edges)
    const connectedIds = new Set<string>();
    for (const e of edges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }
    nodes = nodes.filter((n) => connectedIds.has(n.id));

    return { nodes, edges };
  }, [fullGraph, filters.machineFilters, filters.userFilters, filters.logonTypeFilters, filters.activityMin, filters.activityMax, filters.hideMachineAccounts]);

  const { selected, fitToView, resetLayout } = useCytoscape(containerRef, nodes, edges, visible);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-shrink-0 mb-2">
        <Legend />
        <div className="flex items-center gap-3">
          {nodes.length > 0 && (
            <span className="text-[11px] text-gray-600">
              {nodes.length} nodes &middot; {edges.length} edges
            </span>
          )}
          <div className="flex gap-1.5">
            <ToolbarButton onClick={() => setShowFilters(!showFilters)} active={showFilters}>
              Filters
            </ToolbarButton>
            <ToolbarButton onClick={fitToView}>Fit</ToolbarButton>
            <ToolbarButton onClick={resetLayout}>Reset</ToolbarButton>
          </div>
        </div>
      </div>

      {/* Main area: graph + right panel */}
      <div className="flex flex-1 min-h-0">
        {/* Graph container — full height always */}
        <div
          className="relative flex-1 min-w-0 rounded-lg border border-[#21262d] overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse at center, #0d1117 0%, #010409 100%)',
          }}
        >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex items-center gap-3 text-gray-500 text-sm">
              <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
              Loading graph...
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-400/80 text-sm z-10">
            Error loading events
          </div>
        )}
        {!isLoading && !error && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm z-10">
            No logon events found. Make sure the Agent is collecting Security events.
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />
        {selected && <NodeDetailPanel selected={selected} />}
      </div>

        {/* Resize handle + Filter sidebar (right) */}
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
