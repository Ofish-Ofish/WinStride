import { useRef, useMemo, useState, useCallback, useEffect, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import { type SysmonFilters } from '../shared/filterTypes';
import type { FilterState } from '../../../components/filter/filterPrimitives';
import { saveSysmonFilters } from '../shared/filterSerializer';
import { buildSysmonFilter } from '../shared/buildSysmonFilter';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';
import { INTEGRITY_COLORS } from '../shared/eventMeta';
import SysmonFilterPanel from '../SysmonFilterPanel';
import { buildAggregatedTree, type AggregatedNode } from './transformSysmon';
import { processTreeStyles, processTreeLayout } from './processTreeStyles';
import type { WinEvent } from '../../security/shared/types';
import { resolveTriState } from '../../../components/filter/filterPrimitives';
import { ToolbarButton } from '../../../components/list/VirtualizedEventList';
import { useSeverityIntegration, SEVERITY_COLORS, SEVERITY_LABELS, maxSeverity } from '../../../shared/detection/engine';
import type { Detection } from '../../../shared/detection/rules';
import { useCytoscape } from '../../../shared/graph';

/* ------------------------------------------------------------------ */
/*  Graph-specific defaults: process creation only                     */
/* ------------------------------------------------------------------ */

const GRAPH_DEFAULT_FILTERS: SysmonFilters = {
  eventFilters: new Map<number, FilterState>([[1, 'select']]),
  timeStart: new Date(Date.now() - 86_400_000).toISOString(), // 24h
  timeEnd: '',
  machineFilters: new Map(),
  processFilters: new Map(),
  integrityFilters: new Map(),
  userFilters: new Map(),
  minSeverity: 'low',
};

/* ------------------------------------------------------------------ */
/*  Legend                                                              */
/* ------------------------------------------------------------------ */

function Legend() {
  return (
    <div className="flex items-center gap-5 text-[11px] text-gray-300">
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-[#3b82f6] inline-block" />
        Process
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-[#eab308] inline-block" />
        High Integrity
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
        File Dir
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail panel for selected aggregated node                          */
/* ------------------------------------------------------------------ */

function DetectionsSummary({ detections }: { detections: Detection[] }) {
  if (detections.length === 0) return null;
  const sev = maxSeverity(detections);
  if (!sev) return null;
  return (
    <div className="mt-3 pt-2 border-t border-[#30363d]">
      <span className="text-[#58a6ff] text-[11px] font-semibold">Detections</span>
      <div className="space-y-1 mt-1">
        {detections.map((d) => {
          const c = SEVERITY_COLORS[d.severity];
          return (
            <div key={d.ruleId} className="flex items-center gap-2">
              <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${c.text} ${c.bg}`}>
                {SEVERITY_LABELS[d.severity]}
              </span>
              <span className="text-[11px] text-gray-200 truncate">{d.ruleName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NodeDetail({ node, detections }: { node: AggregatedNode; detections?: Detection[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 right-4 max-w-xl bg-[#161b22]/95 backdrop-blur border border-[#30363d] rounded-lg p-4 text-[12px] z-20 max-h-[50%] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[14px] font-semibold text-white">
          {node.label}
          <span className="ml-2 text-[11px] font-normal text-gray-300">
            {node.count} instance{node.count !== 1 ? 's' : ''}
          </span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          node.type === 'process' ? 'bg-[#58a6ff]/20 text-[#79c0ff]' :
          node.type === 'network' ? 'bg-[#3fb950]/20 text-[#56d364]' :
          'bg-[#f0883e]/20 text-[#f0a050]'
        }`}>
          {node.type}
        </span>
      </div>

      {node.type === 'process' && (
        <div className="space-y-2">
          {node.users.length > 0 && (
            <div>
              <span className="text-[#58a6ff] text-[11px] font-semibold">Users</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {node.users.map((u) => (
                  <span key={u} className="text-white font-mono text-[11px] bg-gray-800 px-1.5 py-0.5 rounded">{u}</span>
                ))}
              </div>
            </div>
          )}
          {node.integrityLevels.length > 0 && (
            <div>
              <span className="text-[#58a6ff] text-[11px] font-semibold">Integrity Levels</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {node.integrityLevels.map((lvl) => (
                  <span key={lvl} className={`text-[11px] font-semibold ${INTEGRITY_COLORS[lvl] ?? 'text-gray-200'}`}>{lvl}</span>
                ))}
              </div>
            </div>
          )}
          {node.fullPaths.length > 0 && (
            <div>
              <span className="text-[#58a6ff] text-[11px] font-semibold">Paths</span>
              {node.fullPaths.slice(0, expanded ? undefined : 3).map((p) => (
                <div key={p} className="font-mono text-[11px] text-gray-200 truncate mt-0.5">{p}</div>
              ))}
              {node.fullPaths.length > 3 && !expanded && (
                <button onClick={() => setExpanded(true)} className="text-[#58a6ff] text-[10px] mt-1 hover:underline">
                  +{node.fullPaths.length - 3} more
                </button>
              )}
            </div>
          )}
          {node.commandLines.length > 0 && (
            <div>
              <span className="text-[#58a6ff] text-[11px] font-semibold">Command Lines</span>
              {node.commandLines.slice(0, expanded ? undefined : 5).map((cmd, i) => (
                <div key={i} className="font-mono text-[10px] text-gray-200 break-all mt-1 bg-gray-900/60 px-2 py-1 rounded">{cmd}</div>
              ))}
              {node.commandLines.length > 5 && !expanded && (
                <button onClick={() => setExpanded(true)} className="text-[#58a6ff] text-[10px] mt-1 hover:underline">
                  +{node.commandLines.length - 5} more
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {node.type === 'network' && (
        <div className="space-y-2">
          <div>
            <span className="text-[#58a6ff] text-[11px] font-semibold">Destinations</span>
            {node.destinations.slice(0, expanded ? undefined : 10).map((d) => (
              <div key={d} className="font-mono text-[11px] text-white mt-0.5">{d}</div>
            ))}
            {node.destinations.length > 10 && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-[#58a6ff] text-[10px] mt-1 hover:underline">
                +{node.destinations.length - 10} more
              </button>
            )}
          </div>
          {node.protocols.length > 0 && (
            <div>
              <span className="text-[#58a6ff] text-[11px] font-semibold">Protocols</span>
              <span className="ml-2 text-white text-[11px]">{node.protocols.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {node.type === 'file' && (
        <div className="space-y-2">
          <div>
            <span className="text-[#58a6ff] text-[11px] font-semibold">Files Created</span>
            <span className="ml-2 text-gray-300 text-[11px]">({node.filePaths.length} unique)</span>
            {node.filePaths.slice(0, expanded ? undefined : 8).map((f) => (
              <div key={f} className="font-mono text-[10px] text-gray-200 truncate mt-0.5">{f}</div>
            ))}
            {node.filePaths.length > 8 && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-[#58a6ff] text-[10px] mt-1 hover:underline">
                +{node.filePaths.length - 8} more
              </button>
            )}
          </div>
        </div>
      )}

      {detections && detections.length > 0 && <DetectionsSummary detections={detections} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProcessTree({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [hideSystem, setHideSystem] = useState(true);
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useState<SysmonFilters>(() => GRAPH_DEFAULT_FILTERS);
  const [panelWidth, setPanelWidth] = useState(() => Math.round(window.innerWidth / 2));

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

  /* ---- Severity integration ---- */
  const sev = useSeverityIntegration(rawEvents, 'sysmon');

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

  /* ---- Client-side filtering + aggregated tree build ---- */
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

    // Severity filter
    events = sev.filterBySeverity(events, filters.minSeverity);

    return buildAggregatedTree(events, hideSystem);
  }, [rawEvents, filters, availableProcesses, availableUsers, hideSystem, sev]);

  /* ---- Prepare graph data with display labels ---- */
  const graphNodes = useMemo(() =>
    treeData.nodes.map((n) => ({
      ...n,
      label: n.count > 1 ? `${n.label} (\u00d7${n.count})` : n.label,
    })),
    [treeData.nodes],
  );

  const graphEdges = useMemo(() =>
    treeData.edges.map((e) => ({
      ...e,
      label: e.count > 1 ? `\u00d7${e.count}` : '',
    })),
    [treeData.edges],
  );

  /* ---- Shared Cytoscape hook ---- */
  const { selected, fitToView, resetLayout } = useCytoscape(
    containerRef, graphNodes, graphEdges, visible, {
      styles: processTreeStyles,
      layout: processTreeLayout,
      minZoom: 0.15,
      relayoutOnDataChange: true,
    },
  );

  const selectedNode = selected ? selected.data as unknown as AggregatedNode : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-shrink-0 mb-2">
        <Legend />
        <div className="flex items-center gap-3">
          {treeData.nodes.length > 0 && (
            <span className="text-[11px] text-gray-300">
              {treeData.nodes.length} nodes &middot; {treeData.edges.length} edges
            </span>
          )}
          <div className="flex gap-1.5">
            <ToolbarButton onClick={() => startTransition(() => setHideSystem((v) => !v))} active={hideSystem}>
              Hide System
            </ToolbarButton>
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
              <div className="flex items-center gap-3 text-gray-300 text-sm">
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
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm z-10">
              No Sysmon events found. Make sure the Agent is collecting Sysmon events.
            </div>
          )}

          <div ref={containerRef} className="w-full h-full" />
          {selectedNode && (
            <NodeDetail
              node={selectedNode}
              detections={(() => {
                if (!selectedNode.eventIds) return [];
                const seen = new Set<string>();
                const result: Detection[] = [];
                for (const eid of selectedNode.eventIds) {
                  for (const d of sev.detections.byEventId.get(eid) ?? []) {
                    if (!seen.has(d.ruleId)) { seen.add(d.ruleId); result.push(d); }
                  }
                }
                return result;
              })()}
            />
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
