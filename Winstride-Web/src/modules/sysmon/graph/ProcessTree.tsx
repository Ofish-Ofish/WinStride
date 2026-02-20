import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import cytoscape, { type Core, type EventObject } from 'cytoscape';
import { fetchEvents } from '../../../api/client';
import { DEFAULT_SYSMON_FILTERS, type SysmonFilters } from '../shared/filterTypes';
import { loadSysmonFilters, saveSysmonFilters } from '../shared/filterSerializer';
import { buildSysmonFilter } from '../shared/buildSysmonFilter';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';
import { INTEGRITY_COLORS } from '../shared/eventMeta';
import SysmonFilterPanel from '../SysmonFilterPanel';
import { buildProcessTree, type ProcessNode } from './transformSysmon';
import { processTreeStyles, processTreeLayout } from './processTreeStyles';
import type { WinEvent } from '../../security/shared/types';
import { resolveTriState } from '../../../components/filter/filterPrimitives';
import { ToolbarButton } from '../../../components/list/VirtualizedEventList';

/* ------------------------------------------------------------------ */
/*  Legend                                                              */
/* ------------------------------------------------------------------ */

function Legend() {
  return (
    <div className="flex items-center gap-5 text-[11px] text-gray-400">
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-[#3b82f6] inline-block" />
        Normal
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-[#eab308] inline-block" />
        High
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-[#f85149] inline-block" />
        System
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rotate-45 bg-[#3fb950] inline-block" />
        Network
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm bg-[#f0883e] inline-block" />
        File
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail panel for selected node                                     */
/* ------------------------------------------------------------------ */

function NodeDetail({ node }: { node: ProcessNode }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 max-w-lg bg-[#161b22]/95 backdrop-blur border border-[#30363d] rounded-lg p-3 text-[11px] z-20">
      <div className="text-[13px] font-semibold text-white mb-2">{node.label}</div>
      {node.type === 'process' && (
        <div className="space-y-1 text-gray-300">
          {node.fullPath && <div><span className="text-gray-500">Path:</span> <span className="font-mono">{node.fullPath}</span></div>}
          {node.commandLine && <div><span className="text-gray-500">CmdLine:</span> <span className="font-mono">{node.commandLine}</span></div>}
          {node.user && <div><span className="text-gray-500">User:</span> {node.user}</div>}
          {node.integrityLevel && (
            <div>
              <span className="text-gray-500">Integrity:</span>{' '}
              <span className={INTEGRITY_COLORS[node.integrityLevel] ?? 'text-gray-300'}>{node.integrityLevel}</span>
            </div>
          )}
          {node.hashes && <div className="font-mono text-[10px] text-gray-400 break-all">{node.hashes}</div>}
        </div>
      )}
      {node.type === 'network' && (
        <div className="space-y-1 text-gray-300">
          <div><span className="text-gray-500">Destination:</span> <span className="font-mono">{node.destinationIp}:{node.destinationPort}</span></div>
          {node.protocol && <div><span className="text-gray-500">Protocol:</span> {node.protocol}</div>}
        </div>
      )}
      {node.type === 'file' && (
        <div className="space-y-1 text-gray-300">
          <div><span className="text-gray-500">File:</span> <span className="font-mono">{node.targetFilename}</span></div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProcessTree({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState<SysmonFilters>(() => loadSysmonFilters() ?? DEFAULT_SYSMON_FILTERS);
  const [panelWidth, setPanelWidth] = useState(() => Math.round(window.innerWidth / 2));
  const [selectedNode, setSelectedNode] = useState<ProcessNode | null>(null);
  const selectedRef = useRef<ProcessNode | null>(null);

  useEffect(() => { selectedRef.current = selectedNode; }, [selectedNode]);
  useEffect(() => { saveSysmonFilters(filters); }, [filters]);

  /* ---- Resize handle ---- */
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
    () => buildSysmonFilter(filters),
    [filters.eventFilters, filters.timeStart, filters.timeEnd],
  );

  /* ---- Data fetch ---- */
  const { data: rawEvents, isLoading, error } = useQuery<WinEvent[]>({
    queryKey: ['events', 'sysmon-graph', odataFilter],
    queryFn: () => fetchEvents({
      $filter: odataFilter,
      $select: 'id,eventId,machineName,timeCreated,eventData',
      $orderby: 'timeCreated desc',
    }),
    refetchInterval: 30_000,
    enabled: visible,
  });

  /* ---- Available values ---- */
  const { availableMachines, availableProcesses, availableUsers } = useMemo(() => {
    if (!rawEvents) return { availableMachines: [], availableProcesses: [], availableUsers: [] };
    const machines = new Set<string>();
    const processes = new Set<string>();
    const users = new Set<string>();
    for (const e of rawEvents) {
      machines.add(e.machineName);
      const proc = parseProcessCreate(e);
      const net = parseNetworkConnect(e);
      const file = parseFileCreate(e);
      const imageName = proc?.imageName ?? net?.imageName ?? file?.imageName;
      if (imageName) processes.add(imageName);
      const user = proc?.user ?? net?.user ?? file?.user;
      if (user) users.add(user);
    }
    return {
      availableMachines: [...machines].sort(),
      availableProcesses: [...processes].sort(),
      availableUsers: [...users].sort(),
    };
  }, [rawEvents]);

  /* ---- Client-side filtering + tree build ---- */
  const treeData = useMemo(() => {
    if (!rawEvents) return { nodes: [], edges: [] };

    let events = rawEvents;

    // Machine filter
    if (filters.machineFilters.size > 0) {
      const selected = new Set<string>();
      const excluded = new Set<string>();
      for (const [name, state] of filters.machineFilters) {
        if (state === 'select') selected.add(name);
        else if (state === 'exclude') excluded.add(name);
      }
      if (selected.size > 0) events = events.filter((e) => selected.has(e.machineName));
      else if (excluded.size > 0) events = events.filter((e) => !excluded.has(e.machineName));
    }

    // Process filter
    if (filters.processFilters.size > 0) {
      const allowed = new Set(resolveTriState(availableProcesses, filters.processFilters));
      events = events.filter((e) => {
        const proc = parseProcessCreate(e);
        const net = parseNetworkConnect(e);
        const file = parseFileCreate(e);
        const imageName = proc?.imageName ?? net?.imageName ?? file?.imageName;
        if (!imageName) return true;
        return allowed.has(imageName);
      });
    }

    // Integrity filter
    if (filters.integrityFilters.size > 0) {
      const allLevels = ['Low', 'Medium', 'High', 'System'];
      const allowed = new Set(resolveTriState(allLevels, filters.integrityFilters));
      events = events.filter((e) => {
        if (e.eventId !== 1) return true;
        const proc = parseProcessCreate(e);
        if (!proc?.integrityLevel) return true;
        return allowed.has(proc.integrityLevel);
      });
    }

    // User filter
    if (filters.userFilters.size > 0) {
      const allowed = new Set(resolveTriState(availableUsers, filters.userFilters));
      events = events.filter((e) => {
        const proc = parseProcessCreate(e);
        const net = parseNetworkConnect(e);
        const file = parseFileCreate(e);
        const user = proc?.user ?? net?.user ?? file?.user;
        if (!user) return true;
        return allowed.has(user);
      });
    }

    return buildProcessTree(events);
  }, [rawEvents, filters, availableProcesses, availableUsers]);

  /* ---- Initialize Cytoscape ---- */
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: processTreeStyles,
      layout: { name: 'grid' },
      minZoom: 0.15,
      maxZoom: 5,
      wheelSensitivity: 3,
    });

    cyRef.current = cy;

    // Click handlers
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target;

      if (selectedRef.current) {
        if (node.hasClass('highlighted')) {
          cy.elements().removeClass('highlighted dimmed');
          const neighborhood = node.neighborhood().add(node);
          neighborhood.addClass('highlighted');
          cy.elements().not(neighborhood).addClass('dimmed');
          setSelectedNode(node.data() as ProcessNode);
        } else {
          cy.elements().removeClass('highlighted dimmed');
          setSelectedNode(null);
        }
        return;
      }

      const neighborhood = node.neighborhood().add(node);
      neighborhood.addClass('highlighted');
      cy.elements().not(neighborhood).addClass('dimmed');
      setSelectedNode(node.data() as ProcessNode);
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target !== cy) return;
      cy.elements().removeClass('highlighted dimmed');
      setSelectedNode(null);
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [containerRef]);

  /* ---- Update elements ---- */
  const hasLaidOut = useRef(false);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const { nodes, edges } = treeData;

    if (nodes.length === 0) {
      cy.elements().remove();
      hasLaidOut.current = false;
      return;
    }

    const newNodeIds = new Set(nodes.map((n) => n.id));
    const newEdgeIds = new Set(edges.map((e) => e.id));

    cy.batch(() => {
      cy.nodes().forEach((n) => { if (!newNodeIds.has(n.id())) n.remove(); });
      cy.edges().forEach((e) => { if (!newEdgeIds.has(e.id())) e.remove(); });

      for (const node of nodes) {
        const existing = cy.getElementById(node.id);
        const data = {
          label: node.label,
          type: node.type,
          integrityLevel: node.integrityLevel,
          fullPath: node.fullPath,
          commandLine: node.commandLine,
          user: node.user,
          hashes: node.hashes,
          destinationIp: node.destinationIp,
          destinationPort: node.destinationPort,
          protocol: node.protocol,
          targetFilename: node.targetFilename,
          parentId: node.parentId,
        };
        if (existing.length > 0) {
          existing.data(data);
        } else {
          cy.add({ group: 'nodes', data: { id: node.id, ...data }, position: { x: 0, y: 0 } });
        }
      }

      for (const edge of edges) {
        const existing = cy.getElementById(edge.id);
        if (existing.length === 0) {
          cy.add({
            group: 'edges',
            data: { id: edge.id, source: edge.source, target: edge.target, type: edge.type },
          });
        }
      }
    });

    // Layout
    if (!hasLaidOut.current || true) {
      const layout = cy.layout(processTreeLayout);
      layout.on('layoutstop', () => {
        cy.fit(undefined, processTreeLayout.padding);
      });
      layout.run();
      hasLaidOut.current = true;
    }
  }, [treeData]);

  /* ---- Resize on visibility change ---- */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !visible) return;
    cy.resize();
    cy.fit(undefined, processTreeLayout.padding);
  }, [visible]);

  const fitToView = useCallback(() => {
    cyRef.current?.fit(undefined, processTreeLayout.padding);
  }, []);

  const resetLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted dimmed');
    setSelectedNode(null);
    const layout = cy.layout(processTreeLayout);
    layout.on('layoutstop', () => {
      cy.fit(undefined, processTreeLayout.padding);
    });
    layout.run();
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-shrink-0 mb-2">
        <Legend />
        <div className="flex items-center gap-3">
          {treeData.nodes.length > 0 && (
            <span className="text-[11px] text-gray-600">
              {treeData.nodes.length} nodes &middot; {treeData.edges.length} edges
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

      {/* Main area: graph + filter sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Graph container */}
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
                Loading process tree...
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400/80 text-sm z-10">
              Error loading events
            </div>
          )}
          {!isLoading && !error && treeData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm z-10">
              No Sysmon events found. Make sure the Agent is collecting Sysmon events.
            </div>
          )}

          <div ref={containerRef} className="w-full h-full" />
          {selectedNode && <NodeDetail node={selectedNode} />}
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
              <SysmonFilterPanel
                filters={filters}
                onFiltersChange={setFilters}
                availableMachines={availableMachines}
                availableProcesses={availableProcesses}
                availableUsers={availableUsers}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
