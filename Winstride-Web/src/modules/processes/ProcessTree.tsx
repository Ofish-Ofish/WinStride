import { useState, useMemo, useCallback } from 'react';
import type { WinProcess } from './shared/types';
import { buildProcessTree, flattenTree, formatMemory, isSystemProcess, type ProcessTreeNode } from './shared/treeBuilder';
import { ToolbarButton } from '../../components/list/VirtualizedEventList';
import ProcessDetailPanel from './ProcessDetailPanel';
import SidePanel from '../../components/layout/SidePanel';

interface Props {
  processes: WinProcess[];
  snapshotTime: string | null;
}

/* ------------------------------------------------------------------ */
/*  SVG Icons                                                          */
/* ------------------------------------------------------------------ */

function ChevronRight({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function ChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M12.78 5.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 6.28a.75.75 0 0 1 1.06-1.06L8 8.94l3.72-3.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

function DotIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3 h-3 ${className}`} viewBox="0 0 8 8" fill="currentColor">
      <circle cx="4" cy="4" r="3" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Tree Row                                                           */
/* ------------------------------------------------------------------ */

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
      className={`flex items-center h-10 cursor-pointer select-none border-b border-[#21262d]/50 transition-colors ${
        isSelected ? 'bg-[#1f6feb]/20 border-l-2 border-l-[#58a6ff]' : 'hover:bg-[#161b22] border-l-2 border-l-transparent'
      }`}
      onClick={onSelect}
    >
      {/* Indentation + expand arrow */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ width: 24 + node.depth * 20, paddingLeft: node.depth * 20 }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#58a6ff] rounded transition-colors hover:bg-[#58a6ff]/10"
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </button>
        ) : (
          <span className="w-6 flex items-center justify-center">
            <DotIcon className={isSys ? 'text-gray-600' : 'text-gray-500'} />
          </span>
        )}
      </div>

      {/* Process name */}
      <span className={`flex-1 min-w-0 truncate text-[13px] font-medium ${
        isPowerShell ? 'text-[#da8ee7]' : isSys ? 'text-gray-300' : 'text-white'
      }`}>
        {p.imageName}
      </span>

      {/* PID */}
      <span className="text-[12px] text-gray-200 tabular-nums w-20 text-right flex-shrink-0 pr-4 font-mono">
        {p.pid}
      </span>

      {/* Session */}
      <span className="text-[12px] text-gray-300 tabular-nums w-14 text-right flex-shrink-0 pr-4">
        {p.sessionId}
      </span>

      {/* Memory */}
      <span className={`text-[12px] tabular-nums w-20 text-right flex-shrink-0 pr-4 font-mono font-medium ${memColor}`}>
        {mem}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProcessTree({ processes, snapshotTime }: Props) {
  const [expandedPids, setExpandedPids] = useState<Set<number>>(() => new Set());
  const [hideSystem, setHideSystem] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

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

  // Count how many are hidden by system filter
  const totalCount = processes.length;
  const hiddenCount = hideSystem ? totalCount - visibleRows.length : 0;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Tree section */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-3 flex-shrink-0">
          {/* Search */}
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
              placeholder="Search processes..."
              className="pl-8 pr-3 py-1 text-[12px] bg-[#0d1117] border border-[#30363d] rounded-md text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors w-64"
            />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 ml-auto text-[12px] text-gray-300">
            <span className="tabular-nums">
              {visibleRows.length} process{visibleRows.length !== 1 ? 'es' : ''}
              {hiddenCount > 0 && <span className="text-gray-500"> ({hiddenCount} system hidden)</span>}
            </span>
            {snapshotTime && (
              <span className="text-gray-500">
                {new Date(snapshotTime).toLocaleString()}
              </span>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-1.5">
            <ToolbarButton onClick={() => setHideSystem((v) => !v)} active={hideSystem}>
              Hide System
            </ToolbarButton>
            <ToolbarButton onClick={expandAll}>
              Expand All
            </ToolbarButton>
            <ToolbarButton onClick={collapseAll}>
              Collapse All
            </ToolbarButton>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center h-9 border-b border-[#30363d] flex-shrink-0 text-[11px] text-gray-400 uppercase tracking-wider font-semibold bg-[#0d1117]/50">
          <div className="flex-1 min-w-0 pl-6">Name</div>
          <div className="w-20 text-right pr-4">PID</div>
          <div className="w-14 text-right pr-4">Sess</div>
          <div className="w-20 text-right pr-4">Memory</div>
        </div>

        {/* Tree rows */}
        <div className="flex-1 overflow-y-auto gf-scrollbar">
          {visibleRows.length === 0 && (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
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
        <SidePanel defaultWidth={400} minWidth={280} maxWidth={700}>
          <ProcessDetailPanel
            process={selectedProcess}
            onClose={() => setSelectedPid(null)}
          />
        </SidePanel>
      )}
    </div>
  );
}
