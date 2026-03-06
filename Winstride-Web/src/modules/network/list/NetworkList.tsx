import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchNetworkConnections } from '../../../api/client';
import { DEFAULT_NETWORK_FILTERS, type NetworkFilters } from '../shared/filterTypes';
import { loadNetworkFilters, saveNetworkFilters } from '../shared/filterSerializer';
import { resolveTriState } from '../../../components/filter/filterPrimitives';
import type { NetworkConnection } from '../shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { applySearch, relativeTime } from '../../../shared/listUtils';
import VirtualizedEventList from '../../../components/list/VirtualizedEventList';
import { COLUMNS, networkJsonMapper } from './networkColumns';
import NetworkDetailRow from './NetworkDetailRow';
import NetworkFilterPanel from '../NetworkFilterPanel';
import { useSeverityIntegration } from '../../../shared/detection/engine';
import { renderSeverityCell } from '../../../shared/detection/SeverityBadge';
import type { WinEvent } from '../../security/shared/types';

const STATE_STYLES: Record<string, string> = {
  'Established': 'bg-[#3fb950]/20 text-[#56d364]',
  'Listen':      'bg-[#58a6ff]/15 text-[#79c0ff]',
  'TimeWait':    'bg-[#f0883e]/20 text-[#f0a050]',
  'CloseWait':   'bg-[#8b5cf6]/20 text-[#a78bfa]',
  'SynSent':     'bg-[#f0883e]/20 text-[#f0a050]',
  'Closed':      'bg-[#8b949e]/15 text-[#8b949e]',
};

const PROTOCOL_STYLES: Record<string, string> = {
  'TCP':  'bg-[#58a6ff]/15 text-[#79c0ff]',
  'tcp':  'bg-[#58a6ff]/15 text-[#79c0ff]',
  'UDP':  'bg-[#3fb950]/20 text-[#56d364]',
  'udp':  'bg-[#3fb950]/20 text-[#56d364]',
};

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function BytesBadge({ bytes }: { bytes: number }) {
  const formatted = formatBytes(bytes);
  if (!bytes) return <span className="tabular-nums text-gray-500">0 B</span>;
  const mb = bytes / (1024 * 1024);
  const color = mb >= 100 ? 'text-[#ff7b72]' : mb >= 10 ? 'text-[#f0a050]' : mb >= 1 ? 'text-[#56d364]' : 'text-white';
  return <span className={`tabular-nums ${color}`}>{formatted}</span>;
}

function renderCell(col: ColumnDef<NetworkConnection>, item: NetworkConnection): React.ReactNode | null {
  switch (col.key) {
    case 'process':
      return (
        <span className="flex items-center gap-1.5">
          <span className="text-white truncate">{item.processName ?? '-'}</span>
          {item.processId != null && <span className="text-gray-300 text-[10px]">({item.processId})</span>}
        </span>
      );
    case 'protocol': {
      if (!item.protocol) return <span className="text-gray-500">-</span>;
      const style = PROTOCOL_STYLES[item.protocol] ?? 'bg-[#8b949e]/15 text-[#8b949e]';
      return (
        <span className="flex items-center">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${style}`}>
            {item.protocol}
          </span>
        </span>
      );
    }
    case 'local':
      return (
        <span className="font-mono text-[11px] truncate">
          <span className="text-gray-200">{item.localAddress ?? '*'}</span>
          <span className="text-gray-500">:</span>
          <span className="text-[#79c0ff]">{item.localPort ?? '*'}</span>
        </span>
      );
    case 'remote':
      return (
        <span className="font-mono text-[11px] truncate">
          <span className="text-gray-200">{item.remoteAddress ?? '*'}</span>
          <span className="text-gray-500">:</span>
          <span className="text-[#f0a050]">{item.remotePort ?? '*'}</span>
        </span>
      );
    case 'state': {
      if (!item.state) return <span className="text-gray-500">-</span>;
      const style = STATE_STYLES[item.state] ?? 'bg-[#8b949e]/15 text-[#8b949e]';
      return (
        <span className="flex items-center">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${style}`}>
            {item.state}
          </span>
        </span>
      );
    }
    case 'sent':
      return <BytesBadge bytes={item.sentBytes} />;
    case 'recv':
      return <BytesBadge bytes={item.recvBytes} />;
    case 'time':
      return (
        <span title={new Date(item.timeCreated).toLocaleString()}>
          {relativeTime(item.timeCreated)}
        </span>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Extra search fields (fields not in column definitions)             */
/* ------------------------------------------------------------------ */

function getExtraSearchFields(c: NetworkConnection): Record<string, string> {
  return {
    module: c.moduleName ?? '',
    pid: c.processId != null ? String(c.processId) : '',
    local: `${c.localAddress ?? ''}:${c.localPort ?? ''}`,
    remote: `${c.remoteAddress ?? ''}:${c.remotePort ?? ''}`,
  };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function NetworkList({ visible }: { visible: boolean }) {
  /* ---- Filter state ---- */
  const [filters, setFilters] = useState<NetworkFilters>(() => loadNetworkFilters() ?? DEFAULT_NETWORK_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => { saveNetworkFilters(filters); }, [filters]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  /* ---- Data fetch ---- */
  const { data, isLoading, error, refetch, failureCount } = useQuery({
    queryKey: ['network-connections'],
    queryFn: () => fetchNetworkConnections(),
    enabled: visible,
    refetchInterval: 30_000,
    retry: 2,
  });

  const items = data?.items ?? [];

  const sev = useSeverityIntegration(items as unknown as WinEvent[], 'network');

  /* ---- Available values for filter panel ---- */
  const availableMachines = useMemo(() => {
    const machines = new Set<string>();
    for (const c of items) machines.add(c.machineName);
    return [...machines].sort();
  }, [items]);

  const availableStates = useMemo(() => {
    const states = new Set<string>();
    for (const c of items) { if (c.state) states.add(c.state); }
    return [...states].sort();
  }, [items]);

  const availableProtocols = useMemo(() => {
    const protocols = new Set<string>();
    for (const c of items) { if (c.protocol) protocols.add(c.protocol); }
    return [...protocols].sort();
  }, [items]);

  const availableProcesses = useMemo(() => {
    const processes = new Set<string>();
    for (const c of items) { if (c.processName) processes.add(c.processName); }
    return [...processes].sort();
  }, [items]);

  /* ---- Client-side filtering ---- */
  const dataFiltered = useMemo(() => {
    if (items.length === 0) return [];

    // Pre-compute filter sets
    let machineSelect: Set<string> | null = null;
    let machineExclude: Set<string> | null = null;
    if (filters.machineFilters.size > 0) {
      const sel = new Set<string>(); const exc = new Set<string>();
      for (const [n, s] of filters.machineFilters) { if (s === 'select') sel.add(n); else if (s === 'exclude') exc.add(n); }
      if (sel.size > 0) machineSelect = sel; else if (exc.size > 0) machineExclude = exc;
    }

    const stateAllowed = filters.stateFilters.size > 0 ? new Set(resolveTriState(availableStates, filters.stateFilters)) : null;
    const protocolAllowed = filters.protocolFilters.size > 0 ? new Set(resolveTriState(availableProtocols, filters.protocolFilters)) : null;
    const processAllowed = filters.processFilters.size > 0 ? new Set(resolveTriState(availableProcesses, filters.processFilters)) : null;

    return items.filter((c) => {
      // Machine (cheapest check first)
      if (machineSelect && !machineSelect.has(c.machineName)) return false;
      if (machineExclude && machineExclude.has(c.machineName)) return false;

      if (stateAllowed && c.state && !stateAllowed.has(c.state)) return false;
      if (stateAllowed && !c.state) return false;

      if (protocolAllowed && c.protocol && !protocolAllowed.has(c.protocol)) return false;
      if (protocolAllowed && !c.protocol) return false;

      if (processAllowed && c.processName && !processAllowed.has(c.processName)) return false;
      if (processAllowed && !c.processName) return false;

      return true;
    });
  }, [items, filters, availableStates, availableProtocols, availableProcesses]);

  /* ---- Search (separated — only reruns when search changes) ---- */
  const filteredItems = useMemo(
    () => applySearch(dataFiltered, debouncedSearch, COLUMNS, getExtraSearchFields),
    [dataFiltered, debouncedSearch],
  );

  const toggleFilters = useCallback(() => setShowFilters((v) => !v), []);

  /* ---- Render ---- */
  return (
    <VirtualizedEventList<NetworkConnection>
      visible={visible}
      isLoading={isLoading}
      error={!!error}
      onRefresh={refetch}
      failureCount={failureCount}
      columns={COLUMNS}
      columnsStorageKey="winstride:networkColumns"
      searchPlaceholder="Search... (process:chrome state:Established ip:192.168 module:kernel)"
      emptyMessage="No network connections found. Make sure the Agent is collecting network data."
      csvEnrichment={(col, item) => {
        if (col.key === 'time') return new Date(item.timeCreated).toISOString();
        if (col.key === 'sent') return String(item.sentBytes);
        if (col.key === 'recv') return String(item.recvBytes);
        return undefined;
      }}
      exportPrefix="winstride-network"
      renderCell={(col, item) => renderSeverityCell(col as any, item as any, sev) ?? renderCell(col, item)}
      renderDetailRow={(item) => <NetworkDetailRow item={item} />}
      renderFilterPanel={() => (
        <NetworkFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          availableMachines={availableMachines}
          availableStates={availableStates}
          availableProtocols={availableProtocols}
          availableProcesses={availableProcesses}
        />
      )}
      showFilters={showFilters}
      onToggleFilters={toggleFilters}
      filteredEvents={filteredItems}
      rawCount={items.length}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={networkJsonMapper}
      getSortValue={sev.getSortValue as any}
    />
  );
}
