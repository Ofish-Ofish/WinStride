import { useRef, useMemo, useState, useCallback, useEffect, useTransition } from 'react';
import { type SysmonFilters } from '../shared/filterTypes';
import type { FilterState } from '../../../components/filter/filterPrimitives';
import { saveSysmonFilters } from '../shared/filterSerializer';
import { SYSMON_EVENT_IDS } from '../shared/eventMeta';
import { PS_EVENT_IDS } from '../../powershell/shared/eventMeta';
import { useModuleEvents } from '../../../shared/hooks/useModuleEvents';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';
import { parseScriptBlock, findSuspiciousKeywords } from '../../powershell/shared/parsePSEvent';
import { INTEGRITY_COLORS } from '../shared/eventMeta';
import { getSystemField } from '../../../shared/eventParsing';
import SysmonFilterPanel from '../SysmonFilterPanel';
import { buildAggregatedTree, type AggregatedNode, type ScriptCorrelationMap } from './transformSysmon';
import type { CorrelatedScript } from '../shared/types';
import { processTreeStyles, processTreeLayout } from './processTreeStyles';
import type { WinEvent } from '../../security/shared/types';
import { resolveTriState } from '../../../components/filter/filterPrimitives';
import { ToolbarButton } from '../../../components/list/VirtualizedEventList';
import { useSeverityIntegration, SEVERITY_COLORS, SEVERITY_LABELS, maxSeverity, edgeSeverity } from '../../../shared/detection/engine';
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
  severityFilter: new Set(['undetected', 'low', 'medium', 'high', 'critical'] as const),
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
      <span className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-[#3b82f6] ring-2 ring-[#da8ee7] inline-block" />
        Has Scripts
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

function ScriptBlocksSection({ scripts }: { scripts: CorrelatedScript[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const sorted = useMemo(() => [...scripts].sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [scripts]);

  return (
    <div className="mt-3 pt-2 border-t border-[#30363d]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#da8ee7] text-[11px] font-semibold">Script Blocks</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#da8ee7]/20 text-[#da8ee7]">
          {scripts.length}
        </span>
      </div>
      <div className="space-y-2">
        {sorted.map((script, i) => {
          const isOpen = expandedIdx === i;
          const preview = script.scriptBlockText.length > 200
            ? script.scriptBlockText.slice(0, 200) + '...'
            : script.scriptBlockText;
          const time = new Date(script.timestamp).toLocaleTimeString();

          return (
            <div key={script.scriptBlockId || i} className="bg-[#0d1117] border border-[#21262d] rounded">
              <button
                onClick={() => setExpandedIdx(isOpen ? null : i)}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[#161b22] transition-colors"
              >
                <span className="text-[10px] text-gray-300 shrink-0">{time}</span>
                {script.path && (
                  <span className="text-[10px] text-[#79c0ff] font-mono truncate">{script.path}</span>
                )}
                {script.suspiciousMatches.length > 0 && (
                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-[#f85149]/20 text-[#ff7b72] shrink-0">
                    suspicious
                  </span>
                )}
                <span className="ml-auto text-[10px] text-gray-300 shrink-0">{isOpen ? '\u25B2' : '\u25BC'}</span>
              </button>
              {isOpen ? (
                <div className="px-2.5 pb-2.5">
                  {script.suspiciousMatches.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {script.suspiciousMatches.map((kw) => (
                        <span key={kw} className="text-[9px] font-semibold px-1 py-0.5 rounded bg-[#f85149]/15 text-[#ff7b72]">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                  <pre className="font-mono text-[10px] text-gray-200 whitespace-pre-wrap break-all max-h-60 overflow-y-auto bg-[#010409] rounded p-2">
                    {script.scriptBlockText}
                  </pre>
                  <div className="mt-1 text-[9px] text-gray-300">
                    PID {script.pid} &middot; {script.machineName}
                  </div>
                </div>
              ) : (
                <div className="px-2.5 pb-2 font-mono text-[10px] text-gray-300 truncate">
                  {preview}
                </div>
              )}
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

      {node.scriptBlocks?.length > 0 && <ScriptBlocksSection scripts={node.scriptBlocks} />}

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

  /* ---- Data fetch: Sysmon events ---- */
  const { events: rawEvents, isLoading, error, isComplete, loadedCount, totalCount } = useModuleEvents({
    logName: 'Microsoft-Windows-Sysmon/Operational',
    allEventIds: SYSMON_EVENT_IDS,
    eventFilters: filters.eventFilters,
    timeStart: filters.timeStart,
    timeEnd: filters.timeEnd,
  }, { enabled: visible });

  /* ---- Data fetch: PowerShell events for correlation ---- */
  const psAllSelected = useMemo(() => new Map<number, FilterState>(PS_EVENT_IDS.map((id) => [id, 'select'])), []);
  const { events: psEvents } = useModuleEvents({
    logName: 'Microsoft-Windows-PowerShell/Operational',
    allEventIds: PS_EVENT_IDS,
    eventFilters: psAllSelected,
    timeStart: filters.timeStart,
    timeEnd: filters.timeEnd,
  }, { enabled: visible });

  /* ---- Build PowerShell PID correlation map ---- */
  const psCorrelation = useMemo<ScriptCorrelationMap>(() => {
    const map: ScriptCorrelationMap = new Map();
    for (const event of psEvents) {
      if (event.eventId !== 4104) continue;
      const parsed = parseScriptBlock(event);
      if (!parsed || !parsed.scriptBlockText) continue;

      const pidStr = getSystemField(event, 'Execution_ProcessID');
      const pid = parseInt(pidStr, 10);
      if (!pid) continue;

      const key = `${pid}:${event.machineName}`;
      const script: CorrelatedScript = {
        scriptBlockText: parsed.scriptBlockText,
        scriptBlockId: parsed.scriptBlockId,
        path: parsed.path,
        isSuspicious: parsed.isSuspicious,
        suspiciousMatches: parsed.suspiciousMatches.length > 0
          ? parsed.suspiciousMatches
          : findSuspiciousKeywords(parsed.scriptBlockText),
        timestamp: event.timeCreated,
        machineName: event.machineName,
        pid,
      };

      const existing = map.get(key);
      if (existing) existing.push(script);
      else map.set(key, [script]);
    }
    return map;
  }, [psEvents]);

  /** Detect machine mismatch: PS script blocks exist but from different machines than Sysmon PS processes */
  const psCorrelationHint = useMemo(() => {
    if (psCorrelation.size === 0) return null;

    // Machines that have PS script blocks
    const psMachines = new Set<string>();
    for (const key of psCorrelation.keys()) {
      psMachines.add(key.split(':').slice(1).join(':'));
    }

    // Machines that have Sysmon powershell.exe processes
    const sysmonPsMachines = new Set<string>();
    for (const event of rawEvents) {
      if (event.eventId !== 1) continue;
      const proc = parseProcessCreate(event);
      if (proc && (proc.imageName.toLowerCase() === 'powershell.exe' || proc.imageName.toLowerCase() === 'pwsh.exe')) {
        sysmonPsMachines.add(event.machineName);
      }
    }

    // Check if any Sysmon PS machine has PS script block data
    const hasOverlap = [...sysmonPsMachines].some((m) => psMachines.has(m));
    if (hasOverlap) return null;

    if (sysmonPsMachines.size > 0 && psMachines.size > 0) {
      const sysmonList = [...sysmonPsMachines].join(', ');
      const psList = [...psMachines].join(', ');
      return `PowerShell Script Block Logging not available on ${sysmonList}. Script blocks found on: ${psList}`;
    }
    return null;
  }, [psCorrelation, rawEvents]);

  /* ---- Severity integration ---- */
  const { detections: sevDetections, filterBySeverity } = useSeverityIntegration(rawEvents, 'sysmon');

  /* ---- Cache parsed results to avoid re-parsing per filter pass ---- */
  const parsedCache = useMemo(() => {
    const cache = new Map<number, { proc: ReturnType<typeof parseProcessCreate>; net: ReturnType<typeof parseNetworkConnect>; file: ReturnType<typeof parseFileCreate> }>();
    for (const e of rawEvents) {
      cache.set(e.id, { proc: parseProcessCreate(e), net: parseNetworkConnect(e), file: parseFileCreate(e) });
    }
    return cache;
  }, [rawEvents]);

  /* ---- Available values ---- */
  const { availableMachines, availableProcesses, availableUsers } = useMemo(() => {
    if (rawEvents.length === 0) return { availableMachines: [], availableProcesses: [], availableUsers: [] };
    const machines = new Set<string>();
    const processes = new Set<string>();
    const users = new Set<string>();
    for (const e of rawEvents) {
      machines.add(e.machineName);
      const cached = parsedCache.get(e.id)!;
      const imageName = cached.proc?.imageName ?? cached.net?.imageName ?? cached.file?.imageName;
      if (imageName) processes.add(imageName);
      const user = cached.proc?.user ?? cached.net?.user ?? cached.file?.user;
      if (user) users.add(user);
    }
    return {
      availableMachines: [...machines].sort(),
      availableProcesses: [...processes].sort(),
      availableUsers: [...users].sort(),
    };
  }, [rawEvents, parsedCache]);

  /* ---- Client-side filtering + aggregated tree build ---- */
  const treeData = useMemo(() => {
    if (rawEvents.length === 0) return { nodes: [], edges: [] };

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
        const cached = parsedCache.get(e.id);
        const imageName = cached?.proc?.imageName ?? cached?.net?.imageName ?? cached?.file?.imageName;
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
        const cached = parsedCache.get(e.id);
        if (!cached?.proc?.integrityLevel) return true;
        return allowed.has(cached.proc.integrityLevel);
      });
    }

    // User filter
    if (filters.userFilters.size > 0) {
      const allowed = new Set(resolveTriState(availableUsers, filters.userFilters));
      events = events.filter((e) => {
        const cached = parsedCache.get(e.id);
        const user = cached?.proc?.user ?? cached?.net?.user ?? cached?.file?.user;
        if (!user) return true;
        return allowed.has(user);
      });
    }

    // Severity filter
    events = filterBySeverity(events, filters.severityFilter);

    return buildAggregatedTree(events, hideSystem, psCorrelation);
  }, [rawEvents, filters, availableProcesses, availableUsers, hideSystem, filterBySeverity, psCorrelation, parsedCache]);

  /* ---- Prepare graph data with display labels ---- */
  const graphNodes = useMemo(() =>
    treeData.nodes.map((n) => ({
      ...n,
      label: n.count > 1 ? `${n.label} (\u00d7${n.count})` : n.label,
      hasScripts: n.scriptBlocks.length > 0 ? 'yes' : 'no',
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

  // Compute severity for each edge from its eventIds
  const edgesWithSeverity = useMemo(
    () => graphEdges.map((e) => ({ ...e, severity: edgeSeverity(e.eventIds, sevDetections) })),
    [graphEdges, sevDetections],
  );

  /* ---- Shared Cytoscape hook ---- */
  const { selected, fitToView, resetLayout } = useCytoscape(
    containerRef, graphNodes, edgesWithSeverity, visible, {
      styles: processTreeStyles,
      layout: processTreeLayout,
      minZoom: 0.15,
      relayoutOnDataChange: false,
    },
  );

  const selectedNode = selected ? selected.data as unknown as AggregatedNode : null;

  const selectedDetections = useMemo(() => {
    if (!selectedNode?.eventIds) return [];
    const seen = new Set<string>();
    const result: Detection[] = [];
    for (const eid of selectedNode.eventIds) {
      for (const d of sevDetections.byEventId.get(eid) ?? []) {
        if (!seen.has(d.ruleId)) { seen.add(d.ruleId); result.push(d); }
      }
    }
    return result;
  }, [selectedNode?.eventIds, sevDetections]);

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
          {isComplete === false && totalCount != null && (
            <div className="flex items-center gap-2 text-[11px] text-gray-300 tabular-nums">
              <div className="w-24 h-1.5 bg-[#1c2128] rounded overflow-hidden">
                <div className="h-full bg-[#58a6ff] rounded transition-all duration-300"
                  style={{ width: `${Math.min(100, (loadedCount / totalCount) * 100)}%` }} />
              </div>
              <span>{loadedCount.toLocaleString()} / {totalCount.toLocaleString()}</span>
            </div>
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

          {psCorrelationHint && (
            <div className="absolute top-3 left-3 right-3 z-10 bg-[#da8ee7]/10 border border-[#da8ee7]/30 rounded-lg px-3 py-2 text-[11px] text-[#da8ee7] backdrop-blur">
              <span className="font-semibold">PS Correlation:</span> {psCorrelationHint}
            </div>
          )}

          <div ref={containerRef} className="w-full h-full" />
          {selectedNode && (
            <NodeDetail
              node={selectedNode}
              detections={selectedDetections}
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
