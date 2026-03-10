import { type NetworkFilters, getDefaultNetworkFilters } from './shared/filterTypes';
import {
  NETWORK_PRESETS,
  serializeNetworkFilters,
  deserializeNetworkFilters,
  cloneNetworkFilters,
} from './shared/filterPresets';
import { SearchableFilterList, PresetBar, CollapsibleSection } from '../../components/filter';

interface Props {
  filters: NetworkFilters;
  onFiltersChange: (f: NetworkFilters) => void;
  availableMachines: string[];
  availableStates: string[];
  availableProtocols: string[];
  availableProcesses: string[];
}

export default function NetworkFilterPanel({
  filters,
  onFiltersChange,
  availableMachines,
  availableStates,
  availableProtocols,
  availableProcesses,
}: Props) {
  const updateFilter = <K extends keyof NetworkFilters>(key: K, value: NetworkFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="p-4 space-y-3">
      {/* Presets */}
      <CollapsibleSection title="Presets" defaultOpen={false}>
        <PresetBar
          filters={filters}
          onFiltersChange={onFiltersChange}
          builtinPresets={NETWORK_PRESETS}
          serialize={serializeNetworkFilters}
          deserialize={deserializeNetworkFilters}
          cloneFilters={cloneNetworkFilters}
          storageKey="winstride:networkPresets"
        />
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Connection States */}
      <SearchableFilterList
        title="States"
        items={availableStates}
        filterMap={filters.stateFilters}
        onFilterMapChange={(m) => updateFilter('stateFilters', m)}
        quickActions={[{ label: 'Clear', onClick: () => updateFilter('stateFilters', new Map()) }]}
        searchable={false}
        defaultHeight={180}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Protocols */}
      <SearchableFilterList
        title="Protocols"
        items={availableProtocols}
        filterMap={filters.protocolFilters}
        onFilterMapChange={(m) => updateFilter('protocolFilters', m)}
        quickActions={[{ label: 'Clear', onClick: () => updateFilter('protocolFilters', new Map()) }]}
        searchable={false}
        defaultHeight={100}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Processes */}
      <SearchableFilterList
        title="Processes"
        items={availableProcesses}
        filterMap={filters.processFilters}
        onFilterMapChange={(m) => updateFilter('processFilters', m)}
        quickActions={[{ label: 'Clear', onClick: () => updateFilter('processFilters', new Map()) }]}
        defaultHeight={200}
      />

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
        onClick={() => onFiltersChange(getDefaultNetworkFilters())}
        className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border border-[#30363d] hover:border-[#3d444d] rounded-md transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
