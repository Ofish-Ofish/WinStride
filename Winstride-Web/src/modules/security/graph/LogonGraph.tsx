import { useRef, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import { transformEvents } from './transformEvents';
import { useCytoscape } from './useCytoscape';
import NodeDetailPanel from './NodeDetailPanel';
import GraphFilterPanel, { DEFAULT_FILTERS, type GraphFilters } from './GraphFilterPanel';
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

  if (filters.eventIds.length > 0) {
    const orClauses = filters.eventIds.map((id) => `eventId eq ${id}`).join(' or ');
    parts.push(`(${orClauses})`);
  }

  if (filters.timeRange !== 'all') {
    const offsets: Record<string, number> = {
      '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000,
      '3d': 259_200_000, '7d': 604_800_000, '30d': 2_592_000_000,
    };
    const since = new Date(Date.now() - offsets[filters.timeRange]);
    // OData requires +HH:MM offset, not 'Z' shorthand
    const iso = since.toISOString().replace('Z', '+00:00');
    parts.push(`timeCreated gt ${iso}`);
  }

  return parts.join(' and ');
}

export default function LogonGraph({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);

  const odataFilter = useMemo(() => buildODataFilter(filters), [filters.eventIds, filters.timeRange]);

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

  // Extract available machines for the filter panel
  const availableMachines = useMemo(
    () => fullGraph.nodes.filter((n) => n.type === 'machine').map((n) => n.label).sort(),
    [fullGraph.nodes],
  );

  // Step 2: apply client-side filters
  const { nodes, edges } = useMemo(() => {
    let { nodes, edges } = fullGraph;

    // Filter out excluded machines
    if (filters.excludedMachines.size > 0) {
      const excluded = filters.excludedMachines;
      nodes = nodes.filter((n) => n.type !== 'machine' || !excluded.has(n.label));
      const removedIds = new Set(
        fullGraph.nodes.filter((n) => n.type === 'machine' && excluded.has(n.label)).map((n) => n.id),
      );
      edges = edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target));
    }

    // Filter edges by logon type
    if (filters.logonTypes.length > 0) {
      const allowedTypes = new Set(filters.logonTypes);
      edges = edges.filter((e) => e.logonType < 0 || allowedTypes.has(e.logonType));
    }

    // Filter by min activity
    if (filters.minActivity > 1) {
      edges = edges.filter((e) => e.logonCount >= filters.minActivity);
    }

    // Remove orphaned nodes (no remaining edges)
    const connectedIds = new Set<string>();
    for (const e of edges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }
    nodes = nodes.filter((n) => connectedIds.has(n.id));

    return { nodes, edges };
  }, [fullGraph, filters.excludedMachines, filters.logonTypes, filters.minActivity]);

  const { selected, fitToView, resetLayout } = useCytoscape(containerRef, nodes, edges, visible);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
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

      {/* Filter panel */}
      {showFilters && (
        <GraphFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          availableMachines={availableMachines}
        />
      )}

      {/* Graph container */}
      <div
        className="relative flex-1 rounded-lg border border-[#21262d] overflow-hidden"
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

        <div ref={containerRef} className="w-full h-full min-h-[500px]" />
        {selected && <NodeDetailPanel selected={selected} />}
      </div>
    </div>
  );
}
