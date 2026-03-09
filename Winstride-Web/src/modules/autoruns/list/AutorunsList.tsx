import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAutoruns } from '../../../api/client';
import { DEFAULT_AUTORUNS_FILTERS, type AutorunsFilters } from '../shared/filterTypes';
import { loadAutorunsFilters, saveAutorunsFilters } from '../shared/filterSerializer';
import AutorunsFilterPanel from '../AutorunsFilterPanel';
import type { AutorunEntry } from '../shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { applySearch, relativeTime } from '../../../shared/listUtils';
import VirtualizedEventList from '../../../components/list/VirtualizedEventList';
import { COLUMNS, autorunsJsonMapper } from './autorunsColumns';
import AutorunsDetailRow from './AutorunsDetailRow';
import { useSeverityIntegration } from '../../../shared/detection/engine';
import { renderSeverityCell } from '../../../shared/detection/SeverityBadge';
import type { WinEvent } from '../../security/shared/types';

const CATEGORY_STYLES: Record<string, string> = {
  'Logon':           'bg-[#58a6ff]/15 text-[#79c0ff]',
  'Services':        'bg-[#8b5cf6]/20 text-[#a78bfa]',
  'Drivers':         'bg-[#f0883e]/20 text-[#f0a050]',
  'Scheduled Tasks': 'bg-[#3fb950]/20 text-[#56d364]',
  'Boot Execute':    'bg-[#f85149]/20 text-[#ff7b72]',
  'Known DLLs':      'bg-[#58a6ff]/15 text-[#58a6ff]',
};

function renderCell(col: ColumnDef<AutorunEntry>, item: AutorunEntry): React.ReactNode | null {
  switch (col.key) {
    case 'entry':
      return (
        <span className="flex items-center gap-2">
          <span className="font-mono truncate">{item.entry}</span>
        </span>
      );
    case 'location':
      return <span className="font-mono text-[11px] text-gray-200 truncate">{item.entryLocation}</span>;
    case 'category': {
      const style = CATEGORY_STYLES[item.category] ?? 'bg-[#8b949e]/15 text-[#8b949e]';
      return (
        <span className="flex items-center">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${style}`}>
            {item.category}
          </span>
        </span>
      );
    }
    case 'company':
      if (!item.company) return <span className="text-gray-500">-</span>;
      return (
        <span className={item.company.toLowerCase().includes('microsoft') ? 'text-[#79c0ff]' : 'text-white'}>
          {item.company}
        </span>
      );
    case 'verified': {
      if (!item.verified) return <span className="text-gray-500">-</span>;
      const v = item.verified.toLowerCase();
      if (v.includes('verified') && !v.includes('not'))
        return (
          <span className="flex items-center">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[#3fb950]/20 text-[#56d364]">Verified</span>
          </span>
        );
      if (v.includes('not verified') || v.includes('(not verified)'))
        return (
          <span className="flex items-center">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[#f85149]/20 text-[#ff7b72]">Not Verified</span>
          </span>
        );
      return <span className="text-gray-300 text-[11px]">{item.verified}</span>;
    }
    case 'time':
      return (
        <span title={new Date(item.timeSynced).toLocaleString()}>
          {relativeTime(item.timeSynced)}
        </span>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Extra search fields (fields not in column definitions)             */
/* ------------------------------------------------------------------ */

function getExtraSearchFields(e: AutorunEntry): Record<string, string> {
  return {
    desc: e.description ?? '',
    path: e.imagePath ?? '',
    hash: e.sha256 ?? e.md5 ?? '',
    launch: e.launchString ?? '',
  };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function AutorunsList({ visible }: { visible: boolean }) {
  /* ---- Filter state ---- */
  const [filters, setFilters] = useState<AutorunsFilters>(() => loadAutorunsFilters() ?? DEFAULT_AUTORUNS_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => { saveAutorunsFilters(filters); }, [filters]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['autoruns'],
    queryFn: () => fetchAutoruns(),
    enabled: visible,
    refetchInterval: 60_000,
    retry: 2,
    structuralSharing: false,
  });

  const items = data?.items ?? [];

  const sev = useSeverityIntegration(items as unknown as WinEvent[], 'autoruns');

  /* ---- Available values for filter panel ---- */
  const availableMachines = useMemo(() => {
    const machines = new Set<string>();
    for (const e of items) machines.add(e.machineName);
    return [...machines].sort();
  }, [items]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const e of items) cats.add(e.category);
    return [...cats].sort();
  }, [items]);

  /* ---- Client-side filtering ---- */
  const dataFiltered = useMemo(() => {
    let events = items;

    // Machine filter (tri-state)
    if (filters.machineFilters.size > 0) {
      let machineSelect: Set<string> | null = null;
      let machineExclude: Set<string> | null = null;
      const sel = new Set<string>(); const exc = new Set<string>();
      for (const [n, s] of filters.machineFilters) { if (s === 'select') sel.add(n); else if (s === 'exclude') exc.add(n); }
      if (sel.size > 0) machineSelect = sel; else if (exc.size > 0) machineExclude = exc;
      if (machineSelect) events = events.filter((e) => machineSelect!.has(e.machineName));
      else if (machineExclude) events = events.filter((e) => !machineExclude!.has(e.machineName));
    }

    // Category filter (tri-state)
    if (filters.categoryFilters.size > 0) {
      let catSelect: Set<string> | null = null;
      let catExclude: Set<string> | null = null;
      const sel = new Set<string>(); const exc = new Set<string>();
      for (const [n, s] of filters.categoryFilters) { if (s === 'select') sel.add(n); else if (s === 'exclude') exc.add(n); }
      if (sel.size > 0) catSelect = sel; else if (exc.size > 0) catExclude = exc;
      if (catSelect) events = events.filter((e) => catSelect!.has(e.category));
      else if (catExclude) events = events.filter((e) => !catExclude!.has(e.category));
    }

    // Verified filter
    if (filters.verifiedFilter === 'verified-only') {
      events = events.filter((e) => {
        const v = e.verified?.toLowerCase() ?? '';
        return v.includes('verified') && !v.includes('not');
      });
    } else if (filters.verifiedFilter === 'not-verified-only') {
      events = events.filter((e) => {
        const v = e.verified?.toLowerCase() ?? '';
        return v.includes('not verified') || v.includes('(not verified)');
      });
    }

    return events;
  }, [items, filters]);

  /* ---- Search (separated — only reruns when search changes) ---- */
  const filteredItems = useMemo(
    () => applySearch(dataFiltered, debouncedSearch, COLUMNS, getExtraSearchFields),
    [dataFiltered, debouncedSearch],
  );

  const toggleFilters = useCallback(() => setShowFilters((v) => !v), []);

  return (
    <VirtualizedEventList<AutorunEntry>
      visible={visible}
      isLoading={isLoading}
      error={!!error}
      columns={COLUMNS}
      columnsStorageKey="winstride:autorunsColumns"
      searchPlaceholder="Search... (entry:svchost category:Services)"
      emptyMessage="No autorun entries found. Make sure the Agent is collecting autoruns."
      csvEnrichment={(col, item) => {
        if (col.key === 'time') return new Date(item.timeSynced).toISOString();
        return undefined;
      }}
      exportPrefix="winstride-autoruns"
      renderCell={(col, item) => renderSeverityCell(col as any, item as any, sev) ?? renderCell(col, item)}
      renderDetailRow={(item) => <AutorunsDetailRow item={item} />}
      renderFilterPanel={() => (
        <AutorunsFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          availableMachines={availableMachines}
          availableCategories={availableCategories}
        />
      )}
      showFilters={showFilters}
      onToggleFilters={toggleFilters}
      filteredEvents={filteredItems}
      rawCount={items.length}
      search={search}
      onSearchChange={setSearch}
      jsonMapper={autorunsJsonMapper}
      getSortValue={sev.getSortValue as any}
    />
  );
}
