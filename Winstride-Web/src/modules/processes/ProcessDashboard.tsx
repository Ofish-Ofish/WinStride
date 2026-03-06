import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProcesses } from '../../api/client';
import ProcessTree from './ProcessTree';

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

  // Available machines
  const machines = useMemo(() => {
    const set = new Set<string>();
    for (const p of items) set.add(p.machineName);
    return [...set].sort();
  }, [items]);

  // Auto-select first machine
  const activeMachine = selectedMachine || machines[0] || '';

  // Filter to selected machine's processes
  const machineProcesses = useMemo(
    () => items.filter((p) => p.machineName === activeMachine),
    [items, activeMachine],
  );

  // Get snapshot time from the first process (all share same batch)
  const snapshotTime = machineProcesses.length > 0 ? machineProcesses[0].timeSynced : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-4 mb-3 flex-shrink-0">
        <h2 className="text-xl font-semibold text-white">Processes</h2>

        {machines.length > 1 && (
          <select
            value={activeMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-[12px] text-white focus:border-[#58a6ff] focus:outline-none"
          >
            {machines.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}

        {machines.length === 1 && (
          <span className="text-[12px] text-gray-300 bg-[#21262d] px-2.5 py-1 rounded">
            {activeMachine}
          </span>
        )}

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto px-3 py-1.5 text-[11px] rounded border border-[#30363d] text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-50"
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Loading / Error states */}
      {isLoading && (
        <div className="flex items-center justify-center flex-1">
          <div className="flex items-center gap-3 text-gray-300 text-sm">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
            Loading processes...
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center justify-center flex-1 text-red-400/80 text-sm">
          Failed to load process data. Is the backend running?
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
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
