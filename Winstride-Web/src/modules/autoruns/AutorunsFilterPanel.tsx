import { type AutorunsFilters, getDefaultAutorunsFilters } from './shared/filterTypes';
import {
  SearchableFilterList,
  CollapsibleSection,
  ToggleSwitch,
} from '../../components/filter';

interface Props {
  filters: AutorunsFilters;
  onFiltersChange: (f: AutorunsFilters) => void;
  availableMachines: string[];
  availableCategories: string[];
}

export default function AutorunsFilterPanel({
  filters,
  onFiltersChange,
  availableMachines,
  availableCategories,
}: Props) {
  const updateFilter = <K extends keyof AutorunsFilters>(key: K, value: AutorunsFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="p-4 space-y-3">
      {/* Categories */}
      <SearchableFilterList
        title="Categories"
        items={availableCategories}
        filterMap={filters.categoryFilters}
        onFilterMapChange={(m) => updateFilter('categoryFilters', m)}
        quickActions={[{ label: 'Clear', onClick: () => updateFilter('categoryFilters', new Map()) }]}
        searchable={false}
        defaultHeight={180}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Verification */}
      <CollapsibleSection title="Verification">
        <ToggleSwitch
          checked={filters.verifiedFilter === 'verified-only'}
          onChange={() =>
            updateFilter(
              'verifiedFilter',
              filters.verifiedFilter === 'verified-only' ? 'all' : 'verified-only',
            )
          }
          label="Verified only"
          activeColor="bg-[#56d364]"
        />
        <ToggleSwitch
          checked={filters.verifiedFilter === 'not-verified-only'}
          onChange={() =>
            updateFilter(
              'verifiedFilter',
              filters.verifiedFilter === 'not-verified-only' ? 'all' : 'not-verified-only',
            )
          }
          label="Not verified only"
          activeColor="bg-[#f85149]"
        />
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Machines */}
      {availableMachines.length > 0 && (
        <>
          <SearchableFilterList
            title="Machines"
            items={availableMachines}
            filterMap={filters.machineFilters}
            onFilterMapChange={(m) => updateFilter('machineFilters', m)}
            quickActions={[{ label: 'Clear', onClick: () => updateFilter('machineFilters', new Map()) }]}
            defaultHeight={160}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Reset */}
      <button
        onClick={() => onFiltersChange(getDefaultAutorunsFilters())}
        className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border border-[#30363d] hover:border-[#3d444d] rounded-md transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
