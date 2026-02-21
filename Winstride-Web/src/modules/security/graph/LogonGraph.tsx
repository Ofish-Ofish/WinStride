import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import { transformEvents, isSystemAccount, LOGON_TYPE_LABELS } from './transformEvents';
import { useCytoscape } from '../../../shared/graph';
import { graphStyles } from './graphStyles';
import { coseLayout } from './graphLayout';
import type { Core } from 'cytoscape';
import NodeDetailPanel from './NodeDetailPanel';
import GraphFilterPanel from './GraphFilterPanel';
import { DEFAULT_FILTERS, resolveTriState, type GraphFilters } from '../shared/filterTypes';
import { loadFiltersFromStorage, saveFiltersToStorage } from '../shared/filterSerializer';
import { buildODataFilter } from '../shared/buildODataFilter';
import type { WinEvent, GraphNode, GraphEdge } from '../shared/types';
import { ToolbarButton } from '../../../components/list/VirtualizedEventList';
import { useSeverityIntegration } from '../../../shared/detection/engine';

/* ── Hub-spoke position calculator (pre-layout seed) ─────────────── */

function computeHubSpokePositions(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const machines = nodes.filter((n) => n.type === 'machine');
  const users = nodes.filter((n) => n.type !== 'machine');

  const machineToUsers = new Map<string, string[]>();
  const userToMachines = new Map<string, string[]>();
  for (const m of machines) machineToUsers.set(m.id, []);
  for (const u of users) userToMachines.set(u.id, []);

  for (const edge of edges) {
    const src = edge.source;
    const tgt = edge.target;
    if (machineToUsers.has(tgt) && userToMachines.has(src)) {
      if (!machineToUsers.get(tgt)!.includes(src)) machineToUsers.get(tgt)!.push(src);
      if (!userToMachines.get(src)!.includes(tgt)) userToMachines.get(src)!.push(tgt);
    }
    if (machineToUsers.has(src) && userToMachines.has(tgt)) {
      if (!machineToUsers.get(src)!.includes(tgt)) machineToUsers.get(src)!.push(tgt);
      if (!userToMachines.get(tgt)!.includes(src)) userToMachines.get(tgt)!.push(src);
    }
  }

  const machineSpacing = 350;
  if (machines.length === 1) {
    positions.set(machines[0].id, { x: 0, y: 0 });
  } else {
    const radius = (machines.length * machineSpacing) / (2 * Math.PI);
    machines.forEach((m, i) => {
      const angle = (2 * Math.PI * i) / machines.length - Math.PI / 2;
      positions.set(m.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  }

  const spokeRadius = 250;
  const userPositionSums = new Map<string, { x: number; y: number; count: number }>();
  for (const [machineId, connectedUsers] of machineToUsers) {
    const machinePos = positions.get(machineId)!;
    const count = connectedUsers.length;
    if (count === 0) continue;
    connectedUsers.forEach((userId, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      const ux = machinePos.x + Math.cos(angle) * spokeRadius;
      const uy = machinePos.y + Math.sin(angle) * spokeRadius;
      const existing = userPositionSums.get(userId);
      if (existing) { existing.x += ux; existing.y += uy; existing.count++; }
      else userPositionSums.set(userId, { x: ux, y: uy, count: 1 });
    });
  }
  for (const [userId, sum] of userPositionSums) {
    positions.set(userId, { x: sum.x / sum.count, y: sum.y / sum.count });
  }

  let orphanX = 0;
  for (const n of nodes) {
    if (!positions.has(n.id)) { positions.set(n.id, { x: orphanX, y: 600 }); orphanX += 120; }
  }
  return positions;
}

/* ── Post-layout: double distances from center ───────────────────── */

function doubleDistancesFromCenter(cy: Core) {
  const center = { x: 0, y: 0 };
  const allNodes = cy.nodes();
  allNodes.forEach((n) => { center.x += n.position('x'); center.y += n.position('y'); });
  center.x /= allNodes.length;
  center.y /= allNodes.length;
  allNodes.forEach((n) => {
    n.position({
      x: center.x + (n.position('x') - center.x) * 2,
      y: center.y + (n.position('y') - center.y) * 2,
    });
  });
}

/* ── Pre-layout: seed hub-spoke positions for resetLayout ────────── */

function preLayoutHubSpoke(cy: Core) {
  const currentNodes: GraphNode[] = cy.nodes().map((n) => n.data() as GraphNode);
  const currentEdges: GraphEdge[] = cy.edges().map((e) => e.data() as GraphEdge);
  const positions = computeHubSpokePositions(currentNodes, currentEdges);
  cy.nodes().forEach((node) => {
    const pos = positions.get(node.id());
    if (pos) node.position(pos);
  });
}

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
    queryFn: () => fetchEvents({
      $filter: odataFilter,
      $select: 'id,eventId,machineName,timeCreated,eventData',
    }),
    refetchInterval: 30000,
  });

  const sev = useSeverityIntegration(events, 'security');

  // Step 0: apply severity filter to raw events before graph aggregation
  const filteredByRisk = useMemo(() => {
    if (!events) return [];
    return sev.filterBySeverity(events, filters.minSeverity);
  }, [events, sev, filters.minSeverity]);

  // Step 1: transform raw events into nodes & edges
  const fullGraph = useMemo(() => {
    if (filteredByRisk.length === 0) return { nodes: [], edges: [] };
    return transformEvents(filteredByRisk);
  }, [filteredByRisk]);

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

  // Extract available values for new filter sections
  const availableIps = useMemo(() => {
    const ips = new Set<string>();
    for (const e of fullGraph.edges) if (e.ipAddress && e.ipAddress !== '-') ips.add(e.ipAddress);
    return [...ips].sort();
  }, [fullGraph.edges]);

  const availableAuthPackages = useMemo(() => {
    const pkgs = new Set<string>();
    for (const e of fullGraph.edges) if (e.authPackage) pkgs.add(e.authPackage);
    return [...pkgs].sort();
  }, [fullGraph.edges]);

  const availableProcesses = useMemo(() => {
    const procs = new Set<string>();
    for (const e of fullGraph.edges) if (e.processName && e.processName !== '-') procs.add(e.processName);
    return [...procs].sort();
  }, [fullGraph.edges]);

  const availableFailureStatuses = useMemo(() => {
    const statuses = new Set<string>();
    for (const e of fullGraph.edges) {
      if (e.failureStatus && e.failureStatus !== '0x0') statuses.add(e.failureStatus);
      if (e.failureSubStatus && e.failureSubStatus !== '0x0') statuses.add(e.failureSubStatus);
    }
    return [...statuses].sort();
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

    // Filter by IP
    if (filters.ipFilters.size > 0) {
      const allowedIps = new Set(resolveTriState(availableIps, filters.ipFilters));
      edges = edges.filter((e) => !e.ipAddress || e.ipAddress === '-' || allowedIps.has(e.ipAddress));
    }

    // Filter by auth package
    if (filters.authPackageFilters.size > 0) {
      const allowedPkgs = new Set(resolveTriState(availableAuthPackages, filters.authPackageFilters));
      edges = edges.filter((e) => !e.authPackage || allowedPkgs.has(e.authPackage));
    }

    // Filter by process
    if (filters.processFilters.size > 0) {
      const allowedProcs = new Set(resolveTriState(availableProcesses, filters.processFilters));
      edges = edges.filter((e) => !e.processName || e.processName === '-' || allowedProcs.has(e.processName));
    }

    // Filter by failure status
    if (filters.failureStatusFilters.size > 0) {
      const allowedStatuses = new Set(resolveTriState(availableFailureStatuses, filters.failureStatusFilters));
      edges = edges.filter((e) => {
        if ((!e.failureStatus || e.failureStatus === '0x0') && (!e.failureSubStatus || e.failureSubStatus === '0x0')) return true;
        return allowedStatuses.has(e.failureStatus) || allowedStatuses.has(e.failureSubStatus);
      });
    }

    // Elevated only
    if (filters.showElevatedOnly) {
      edges = edges.filter((e) => e.elevatedToken);
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
  }, [fullGraph, filters, availableIps, availableAuthPackages, availableProcesses, availableFailureStatuses]);

  const { selected, fitToView, resetLayout } = useCytoscape(containerRef, nodes, edges, visible, {
    styles: graphStyles,
    layout: coseLayout,
    preLayout: preLayoutHubSpoke,
    postLayout: doubleDistancesFromCenter,
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
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
        {selected && <NodeDetailPanel selected={selected} detections={sev.detections} />}
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
                availableIps={availableIps}
                availableAuthPackages={availableAuthPackages}
                availableProcesses={availableProcesses}
                availableFailureStatuses={availableFailureStatuses}
                maxActivity={maxActivity}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
