import { useState, useMemo, useCallback } from 'react';
import type { WinProcess } from './shared/types';
import { buildProcessTree, flattenTree, formatMemory, isSystemProcess, type ProcessTreeNode } from './shared/treeBuilder';
import ProcessDetailPanel from './ProcessDetailPanel';

interface Props {
  processes: WinProcess[];
  snapshotTime: string | null;
}

function TreeRow({
  node,
  isSelected,
  onSelect,
  onToggle,
  isExpanded,
  hasChildren,
}: {
  node: ProcessTreeNode;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  isExpanded: boolean;
  hasChildren: boolean;
}) {
  const p = node.process;
  const isSys = isSystemProcess(p.imageName);
  const mem = formatMemory(p.workingSetSize);
  const memMb = p.workingSetSize / (1024 * 1024);
  const memColor = memMb >= 500 ? 'text-[#ff7b72]' : memMb >= 100 ? 'text-[#f0a050]' : memMb >= 50 ? 'text-[#56d364]' : 'text-white';
  const isPowerShell = /^(powershell|pwsh)\.exe$/i.test(p.imageName);

  return (
    <div
      className={`flex items-center h-7 cursor-pointer select-none border-b border-[#21262d]/50 transition-colors ${
        isSelected ? 'bg-[#1f6feb]/20' : 'hover:bg-[#161b22]'
      }`}
      onClick={onSelect}
    >
      {/* Indentation + expand arrow */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ width: 20 + node.depth * 18, paddingLeft: node.depth * 18 }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white text-[10px]"
          >
            {isExpanded ? '\u25BC' : '\u25B6'}
          </button>
        ) : (
          <span className="w-5" />
        )}
      </div>

      {/* Process name */}
      <span className={`flex-1 min-w-0 truncate text-[12px] ${isSys ? 'text-gray-300' : 'text-white'} ${isPowerShell ? 'text-[#da8ee7]' : ''}`}>
        {p.imageName}
      </span>

      {/* PID */}
      <span className="text-[11px] text-gray-300 tabular-nums w-16 text-right flex-shrink-0 pr-3">
        {p.pid}
      </span>

      {/* Session */}
      <span className="text-[11px] text-gray-300 tabular-nums w-12 text-right flex-shrink-0 pr-3">
        {p.sessionId}
      </span>

      {/* Memory */}
      <span className={`text-[11px] tabular-nums w-16 text-right flex-shrink-0 pr-3 ${memColor}`}>
        {mem}
      </span>
    </div>
  );
}

export default function ProcessTree({ processes, snapshotTime }: Props) {
  const [expandedPids, setExpandedPids] = useState<Set<number>>(() => new Set());
  const [hideSystem, setHideSystem] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useState(380);

  const tree = useMemo(() => buildProcessTree(processes), [processes]);

  const searchLower = search.toLowerCase().trim();
  const visibleRows = useMemo(
    () => flattenTree(tree, expandedPids, hideSystem, searchLower),
    [tree, expandedPids, hideSystem, searchLower],
  );

  const toggleExpand = useCallback((pid: number) => {
    setExpandedPids((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<number>();
    function walk(nodes: ProcessTreeNode[]) {
      for (const n of nodes) {
        if (n.children.length > 0) all.add(n.process.pid);
        walk(n.children);
      }
    }
    walk(tree);
    setExpandedPids(all);
  }, [tree]);

  const collapseAll = useCallback(() => setExpandedPids(new Set()), []);

  const selectedProcess = useMemo(
    () => selectedPid != null ? processes.find((p) => p.pid === selectedPid) ?? null : null,
    [processes, selectedPid],
  );

  // Resize handle for detail panel
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.min(700, Math.max(280, startW + delta)));
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

  // Count how many are hidden by system filter
  const totalCount = processes.length;
  const hiddenCount = hideSystem ? totalCount - visibleRows.length : 0;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Tree section */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-2 flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search processes..."
            className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-[12px] text-white placeholder-gray-500 focus:border-[#58a6ff] focus:outline-none w-64"
          />
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] text-gray-300 tabular-nums">
              {visibleRows.length} process{visibleRows.length !== 1 ? 'es' : ''}
              {hiddenCount > 0 && <span className="text-gray-500"> ({hiddenCount} system hidden)</span>}
            </span>
            {snapshotTime && (
              <span className="text-[10px] text-gray-500 ml-2">
                Snapshot: {new Date(snapshotTime).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setHideSystem((v) => !v)}
              className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                hideSystem
                  ? 'bg-[#1f6feb]/20 border-[#1f6feb]/40 text-[#58a6ff]'
                  : 'bg-transparent border-[#30363d] text-gray-300 hover:text-white'
              }`}
            >
              Hide System
            </button>
            <button
              onClick={expandAll}
              className="px-2 py-1 text-[11px] rounded border border-[#30363d] text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-2 py-1 text-[11px] rounded border border-[#30363d] text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center h-7 border-b border-[#30363d] flex-shrink-0 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
          <div className="flex-1 min-w-0 pl-5">Name</div>
          <div className="w-16 text-right pr-3">PID</div>
          <div className="w-12 text-right pr-3">Sess</div>
          <div className="w-16 text-right pr-3">Memory</div>
        </div>

        {/* Tree rows */}
        <div className="flex-1 overflow-y-auto gf-scrollbar">
          {visibleRows.length === 0 && (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              {processes.length === 0 ? 'No process data available.' : 'No matching processes.'}
            </div>
          )}
          {visibleRows.map((node) => (
            <TreeRow
              key={node.process.pid}
              node={node}
              isSelected={selectedPid === node.process.pid}
              onSelect={() => setSelectedPid(
                selectedPid === node.process.pid ? null : node.process.pid,
              )}
              onToggle={() => toggleExpand(node.process.pid)}
              isExpanded={expandedPids.has(node.process.pid) || !!searchLower}
              hasChildren={node.children.length > 0}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedProcess && (
        <>
          <div
            onMouseDown={onResizeStart}
            className="w-1.5 flex-shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-[#58a6ff]/10 transition-colors"
          >
            <div className="w-[3px] h-10 rounded-full bg-[#30363d] group-hover:bg-[#58a6ff]/60 transition-colors" />
          </div>
          <div
            className="flex-shrink-0 border-l border-[#30363d] bg-[#161b22] overflow-hidden"
            style={{ width: panelWidth }}
          >
            <ProcessDetailPanel
              process={selectedProcess}
              onClose={() => setSelectedPid(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
