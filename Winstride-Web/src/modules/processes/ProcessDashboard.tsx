import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProcesses } from '../../api/client';
import { ToolbarButton } from '../../components/list/VirtualizedEventList';
import ProcessTree from './ProcessTree';

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.001 7.001 0 0 1 14.95 7.16a.75.75 0 1 1-1.49.178A5.501 5.501 0 0 0 8 2.5ZM1.705 8.005a.75.75 0 0 1 .834.656 5.501 5.501 0 0 0 9.592 2.97l-1.204-1.204A.25.25 0 0 1 11.104 10h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.001 7.001 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834Z" />
    </svg>
  );
}

export default function ProcessDashboard() {
  const [selectedMachine, setSelectedMachine] = useState<string>('');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['processes'],
    queryFn: () => fetchProcesses(),
    refetchInterval: 30_000,
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
          <ToolbarButton onClick={() => refetch()}>
            <span className="flex items-center gap-1.5">
              <RefreshIcon spinning={isFetching} />
              {isFetching ? 'Refreshing...' : 'Refresh'}
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
