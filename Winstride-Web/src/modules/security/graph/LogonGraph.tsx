import { useRef, useMemo, useDeferredValue, useState, useCallback, useEffect } from 'react';
import { transformEvents, isSystemAccount, LOGON_TYPE_LABELS } from './transformEvents';
import { useCytoscape } from '../../../shared/graph';
import { graphStyles } from './graphStyles';
import { coseLayout } from './graphLayout';
import type { Core } from 'cytoscape';
import NodeDetailPanel from './NodeDetailPanel';
import GraphFilterPanel from './GraphFilterPanel';
import { DEFAULT_FILTERS, resolveTriState, type GraphFilters } from '../shared/filterTypes';
import { loadFiltersFromStorage, saveFiltersToStorage } from '../shared/filterSerializer';
import type { GraphNode, GraphEdge } from '../shared/types';
import { ToolbarButton } from '../../../components/list/VirtualizedEventList';
import { useSeverityIntegration, edgeSeverity } from '../../../shared/detection/engine';
import { useModuleEvents } from '../../../shared/hooks/useModuleEvents';
import { ALL_EVENT_IDS } from '../shared/eventMeta';
import { useMachineAliases } from '../shared/useMachineAliases';

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

export default function LogonGraph({ visible = true }: { visible?: boolean }) {
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

  const { events, isLoading, error, isComplete, loadedCount, totalCount } = useModuleEvents({
    logName: 'Security',
    allEventIds: ALL_EVENT_IDS,
    eventFilters: filters.eventFilters,
    timeStart: filters.timeStart,
    timeEnd: filters.timeEnd,
  }, { enabled: visible });

  // Step 0a: compute aliases from raw events (most complete alias map for detection)
  const { mergedAliases, autoResult: autoAliasResult, userAliases: machineAliases, setUserAliases: updateAliases } = useMachineAliases(events);

  // Step 0b: run detection with alias-aware correlation
  const { detections: sevDetections, filterBySeverity } = useSeverityIntegration(events, 'security', mergedAliases);

  // Step 0c: apply severity filter to raw events before graph aggregation
  const filteredByRisk = useMemo(() => {
    if (!events) return [];
    return filterBySeverity(events, filters.severityFilter);
  }, [events, filterBySeverity, filters.severityFilter]);

  // Step 1: transform raw events into nodes & edges (with alias resolution)
  const fullGraph = useMemo(() => {
    if (filteredByRisk.length === 0) return { nodes: [], edges: [] };
    return transformEvents(filteredByRisk, mergedAliases);
  }, [filteredByRisk, mergedAliases]);

  // Extract all available filter values in a single pass over nodes + edges
  const { availableMachines, availableUsers, maxActivity, availableIps, availableAuthPackages, availableProcesses, availableFailureStatuses } = useMemo(() => {
    const machines: string[] = [];
    const users: string[] = [];
    for (const n of fullGraph.nodes) {
      if (n.type === 'machine') machines.push(n.label);
      else if (n.type === 'user') users.push(n.label);
    }
    machines.sort();
    users.sort();

    let maxAct = 0;
    const ips = new Set<string>();
    const pkgs = new Set<string>();
    const procs = new Set<string>();
    const statuses = new Set<string>();
    for (const e of fullGraph.edges) {
      if (e.logonCount > maxAct) maxAct = e.logonCount;
      if (e.ipAddress && e.ipAddress !== '-') ips.add(e.ipAddress);
      if (e.authPackage) pkgs.add(e.authPackage);
      if (e.processName && e.processName !== '-') procs.add(e.processName);
      if (e.failureStatus && e.failureStatus !== '0x0') statuses.add(e.failureStatus);
      if (e.failureSubStatus && e.failureSubStatus !== '0x0') statuses.add(e.failureSubStatus);
    }

    return {
      availableMachines: machines,
      availableUsers: users,
      maxActivity: maxAct || 50,
      availableIps: [...ips].sort(),
      availableAuthPackages: [...pkgs].sort(),
      availableProcesses: [...procs].sort(),
      availableFailureStatuses: [...statuses].sort(),
    };
  }, [fullGraph]);

  // Step 2: apply client-side filters (single pass for nodes, single pass for edges)
  const deferredFilters = useDeferredValue(filters);
  const { nodes, edges } = useMemo(() => {
    const { nodes: allNodes, edges: allEdges } = fullGraph;

    // Pre-compute tri-state filter sets
    const machineSelected = new Set<string>();
    const machineExcluded = new Set<string>();
    for (const [name, state] of deferredFilters.machineFilters) {
      if (state === 'select') machineSelected.add(name);
      else if (state === 'exclude') machineExcluded.add(name);
    }

    const userSelected = new Set<string>();
    const userExcluded = new Set<string>();
    for (const [name, state] of deferredFilters.userFilters) {
      if (state === 'select') userSelected.add(name);
      else if (state === 'exclude') userExcluded.add(name);
    }

    const allLogonTypes = Object.keys(LOGON_TYPE_LABELS).map(Number);
    const allowedLogonTypes = new Set(resolveTriState(allLogonTypes, deferredFilters.logonTypeFilters));
    const allowedIps = deferredFilters.ipFilters.size > 0 ? new Set(resolveTriState(availableIps, deferredFilters.ipFilters)) : null;
    const allowedPkgs = deferredFilters.authPackageFilters.size > 0 ? new Set(resolveTriState(availableAuthPackages, deferredFilters.authPackageFilters)) : null;
    const allowedProcs = deferredFilters.processFilters.size > 0 ? new Set(resolveTriState(availableProcesses, deferredFilters.processFilters)) : null;
    const allowedStatuses = deferredFilters.failureStatusFilters.size > 0 ? new Set(resolveTriState(availableFailureStatuses, deferredFilters.failureStatusFilters)) : null;

    // Single pass: filter nodes, collect removed IDs
    const removedNodeIds = new Set<string>();
    const filteredNodes: typeof allNodes = [];
    for (const n of allNodes) {
      if (n.type === 'machine') {
        if (machineSelected.size > 0 && !machineSelected.has(n.label)) { removedNodeIds.add(n.id); continue; }
        if (machineExcluded.size > 0 && machineExcluded.has(n.label)) { removedNodeIds.add(n.id); continue; }
      } else if (n.type === 'user') {
        if (userSelected.size > 0 && !userSelected.has(n.label)) { removedNodeIds.add(n.id); continue; }
        if (userExcluded.size > 0 && userExcluded.has(n.label)) { removedNodeIds.add(n.id); continue; }
        if (deferredFilters.hideMachineAccounts && isSystemAccount(n.label)) { removedNodeIds.add(n.id); continue; }
      }
      filteredNodes.push(n);
    }

    // Single pass: filter edges
    const filteredEdges: typeof allEdges = [];
    for (const e of allEdges) {
      if (removedNodeIds.has(e.source) || removedNodeIds.has(e.target)) continue;
      if (e.logonType >= 0 && !allowedLogonTypes.has(e.logonType)) continue;
      if (allowedIps && e.ipAddress && e.ipAddress !== '-' && !allowedIps.has(e.ipAddress)) continue;
      if (allowedPkgs && e.authPackage && !allowedPkgs.has(e.authPackage)) continue;
      if (allowedProcs && e.processName && e.processName !== '-' && !allowedProcs.has(e.processName)) continue;
      if (allowedStatuses) {
        const hasFailure = (e.failureStatus && e.failureStatus !== '0x0') || (e.failureSubStatus && e.failureSubStatus !== '0x0');
        if (hasFailure && !allowedStatuses.has(e.failureStatus) && !allowedStatuses.has(e.failureSubStatus)) continue;
      }
      if (deferredFilters.showElevatedOnly && !e.elevatedToken) continue;
      if (e.logonCount < deferredFilters.activityMin) continue;
      if (deferredFilters.activityMax !== Infinity && e.logonCount > deferredFilters.activityMax) continue;
      filteredEdges.push(e);
    }

    // Remove orphaned nodes
    const connectedIds = new Set<string>();
    for (const e of filteredEdges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }
    const nodes = filteredNodes.filter((n) => connectedIds.has(n.id));

    return { nodes, edges: filteredEdges };
  }, [fullGraph, deferredFilters, availableIps, availableAuthPackages, availableProcesses, availableFailureStatuses]);

  // Compute severity for each edge from its eventIds
  const edgesWithSeverity = useMemo(
    () => edges.map((e) => ({ ...e, severity: edgeSeverity(e.eventIds, sevDetections) })),
    [edges, sevDetections],
  );

  const { selected, fitToView, resetLayout } = useCytoscape(containerRef, nodes, edgesWithSeverity, visible, {
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
          {isComplete === false && totalCount != null && (
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
        {selected && <NodeDetailPanel selected={selected} detections={sevDetections} />}
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
                machineAliases={machineAliases}
                onMachineAliasesChange={updateAliases}
                autoDetected={autoAliasResult.detected}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
