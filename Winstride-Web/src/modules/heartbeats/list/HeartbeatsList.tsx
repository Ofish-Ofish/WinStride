import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHeartbeats } from '../../../api/client';
import type { Heartbeat } from '../shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { applySearch, relativeTime } from '../../../shared/listUtils';
import VirtualizedEventList from '../../../components/list/VirtualizedEventList';
import { COLUMNS, heartbeatsJsonMapper } from './heartbeatsColumns';

function StatusBadge({ alive, lastSeen }: { alive: boolean; lastSeen: string }) {
  const stale = Date.now() - new Date(lastSeen).getTime() > 5 * 60_000;
  if (alive && !stale) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#56d364]/15 text-[#56d364] border border-[#56d364]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[#56d364] animate-pulse" />
        Online
      </span>
    );
  }
  if (alive && stale) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f0a050]/15 text-[#f0a050] border border-[#f0a050]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[#f0a050]" />
        Stale
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f85149]/15 text-[#f85149] border border-[#f85149]/30">
      <span className="w-1.5 h-1.5 rounded-full bg-[#f85149]" />
      Offline
    </span>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-md px-4 py-2 min-w-[100px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-300">{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{count}</div>
    </div>
  );
}

function renderCell(col: ColumnDef<Heartbeat>, item: Heartbeat): React.ReactNode | null {
  switch (col.key) {
    case 'status':
      return <StatusBadge alive={item.isAlive} lastSeen={item.lastSeen} />;
    case 'time':
      return (
        <span title={new Date(item.lastSeen).toLocaleString()}>
          {relativeTime(item.lastSeen)}
        </span>
      );
    default:
      return null;
  }
}

export default function HeartbeatsList({ visible }: { visible: boolean }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, refetch, isFetching, failureCount } = useQuery({
    queryKey: ['heartbeats'],
    queryFn: () => fetchHeartbeats(),
    enabled: visible,
    refetchInterval: 15_000,
    retry: 2,
    structuralSharing: false,
  });

  const items = data?.items ?? [];

  const filteredItems = useMemo(
    () => applySearch(items, debouncedSearch, COLUMNS),
    [items, debouncedSearch],
  );

  const summary = useMemo(() => {
    let online = 0, stale = 0, offline = 0;
    const now = Date.now();
    for (const h of items) {
      const age = now - new Date(h.lastSeen).getTime();
      if (!h.isAlive) offline++;
      else if (age > 5 * 60_000) stale++;
      else online++;
    }
    return { online, stale, offline, total: items.length };
  }, [items]);

  return (
    <VirtualizedEventList<Heartbeat>
      visible={visible}
      isLoading={isLoading}
      error={!!error}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      failureCount={failureCount}
      columns={COLUMNS}
      columnsStorageKey="winstride:heartbeatsColumns"
      searchPlaceholder="Search machines..."
      emptyMessage="No heartbeats found. Make sure agents are reporting."
      csvEnrichment={(col, item) => {
        if (col.key === 'time') return new Date(item.lastSeen).toISOString();
        return undefined;
      }}
      exportPrefix="winstride-heartbeats"
      renderCell={renderCell}
      headerContent={
        <div className="flex gap-3 mb-3">
          <SummaryCard label="Online" count={summary.online} color="#56d364" />
          <SummaryCard label="Stale" count={summary.stale} color="#f0a050" />
          <SummaryCard label="Offline" count={summary.offline} color="#f85149" />
          <SummaryCard label="Total" count={summary.total} color="#8b949e" />
        </div>
      }
      filteredEvents={filteredItems}
      rawCount={items.length}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={heartbeatsJsonMapper}
    />
  );
}
