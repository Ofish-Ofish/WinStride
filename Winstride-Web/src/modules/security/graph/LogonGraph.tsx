import { useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import { transformEvents } from './transformEvents';
import { useCytoscape } from './useCytoscape';
import NodeDetailPanel from './NodeDetailPanel';
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

function ToolbarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-[11px] text-gray-400 hover:text-gray-200 bg-[#161b22] hover:bg-[#1c2128] rounded-md border border-[#30363d] transition-all duration-150"
    >
      {children}
    </button>
  );
}

export default function LogonGraph({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: events, isLoading, error } = useQuery<WinEvent[]>({
    queryKey: ['events', 'security-graph'],
    queryFn: () => fetchEvents({ logName: 'Security' }),
    refetchInterval: 30000,
  });

  const { nodes, edges } = useMemo(() => {
    if (!events) return { nodes: [], edges: [] };
    return transformEvents(events);
  }, [events]);

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
            <ToolbarButton onClick={fitToView}>Fit</ToolbarButton>
            <ToolbarButton onClick={resetLayout}>Reset</ToolbarButton>
          </div>
        </div>
      </div>

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
