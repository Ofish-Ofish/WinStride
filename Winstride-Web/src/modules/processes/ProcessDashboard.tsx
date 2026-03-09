import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProcesses } from '../../api/client';
import { ToolbarButton } from '../../components/list/VirtualizedEventList';
import ProcessTree from './ProcessTree';
import { usePollPause } from '../../shared/context/PollPauseContext';

export default function ProcessDashboard() {
  const [selectedMachine, setSelectedMachine] = useState<string>('');
  const { paused, togglePause } = usePollPause();

  const { data, isLoading, error } = useQuery({
    queryKey: ['processes'],
    queryFn: () => fetchProcesses(),
    enabled: !paused,
    refetchInterval: 2_000,
    retry: 2,
    structuralSharing: false,
  });

  const items = data?.items ?? [];

  const machines = useMemo(() => {
    const set = new Set<string>();
    for (const p of items) set.add(p.machineName);
    return [...set].sort();
  }, [items]);

  const activeMachine = selectedMachine || machines[0] || '';

  const machineProcesses = useMemo(
    () => items.filter((p) => p.machineName === activeMachine),
    [items, activeMachine],
  );

  const snapshotTime = machineProcesses.length > 0 ? machineProcesses[0].timeSynced : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold text-white">Processes</h2>

        {machines.length > 1 && (
          <select
            value={activeMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[13px] text-white focus:border-[#58a6ff] focus:outline-none transition-colors"
          >
            {machines.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}

        {machines.length === 1 && (
          <span className="text-[13px] text-gray-200 bg-[#21262d] px-3 py-1.5 rounded-md font-medium">
            {activeMachine}
          </span>
        )}

        <div className="ml-auto">
          <ToolbarButton onClick={togglePause}>
            <span className="flex items-center gap-1.5">
              {paused ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="2" width="4" height="12" rx="1" />
                  <rect x="9" y="2" width="4" height="12" rx="1" />
                </svg>
              )}
              {paused ? 'Resume' : 'Live'}
            </span>
          </ToolbarButton>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center flex-1">
          <div className="flex items-center gap-3 text-gray-300 text-[14px]">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            Loading processes...
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex items-center justify-center flex-1 text-[#ff7b72] text-[14px]">
          Failed to load process data. Is the backend running?
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && items.length === 0 && (
        <div className="flex items-center justify-center flex-1 text-gray-400 text-[14px]">
          No process data available. The agent hasn't sent any snapshots yet.
        </div>
      )}

      {/* Tree */}
      {!isLoading && !error && machineProcesses.length > 0 && (
        <ProcessTree processes={machineProcesses} snapshotTime={snapshotTime} />
      )}
    </div>
  );
}
