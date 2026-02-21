import { useState, useMemo } from 'react';
import type { FilterState } from './filterPrimitives';
import { countVisible, cycleMap } from './filterPrimitives';
import CollapsibleSection from './CollapsibleSection';
import TriStateCheckbox from './TriStateCheckbox';
import QuickAction from './QuickAction';
import ResizableList from './ResizableList';

interface QuickActionDef {
  label: string;
  onClick: () => void;
}

export default function SearchableFilterList<T extends string | number>({
  title,
  items,
  filterMap,
  onFilterMapChange,
  labelFn,
  subFn,
  quickActions,
  headerSlot,
  searchable = true,
  defaultHeight = 140,
  defaultOpen = true,
}: {
  title: string;
  items: T[];
  filterMap: Map<T, FilterState>;
  onFilterMapChange: (m: Map<T, FilterState>) => void;
  labelFn?: (item: T) => string;
  subFn?: (item: T) => string | undefined;
  quickActions?: QuickActionDef[];
  headerSlot?: React.ReactNode;
  searchable?: boolean;
  defaultHeight?: number;
  defaultOpen?: boolean;
}) {
  const [search, setSearch] = useState('');

  const visibleCount = countVisible(items, filterMap);

  const filtered = useMemo(
    () => searchable && search
      ? items.filter((i) => String(i).toLowerCase().includes(search.toLowerCase()))
      : items,
    [items, search, searchable],
  );

  const right = (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] tabular-nums text-gray-600">
        {visibleCount}/{items.length}
      </span>
      {quickActions?.map((a) => (
        <QuickAction key={a.label} label={a.label} onClick={a.onClick} />
      ))}
    </div>
  );

  return (
    <CollapsibleSection title={title} right={right} defaultOpen={defaultOpen}>
      {headerSlot}

      {searchable && (
        <div className="relative mb-2">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none"
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
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1 text-[12px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors"
          />
        </div>
      )}

      <ResizableList defaultHeight={defaultHeight}>
        <div className="space-y-0.5">
          {filtered.length === 0 && (
            <div className="text-[12px] text-gray-600 py-1">No items found</div>
          )}
          {filtered.map((item) => (
            <TriStateCheckbox
              key={String(item)}
              state={filterMap.get(item)}
              onCycle={() => onFilterMapChange(cycleMap(filterMap, item))}
              label={labelFn ? labelFn(item) : String(item)}
              sub={subFn?.(item)}
            />
          ))}
        </div>
      </ResizableList>
    </CollapsibleSection>
  );
}
