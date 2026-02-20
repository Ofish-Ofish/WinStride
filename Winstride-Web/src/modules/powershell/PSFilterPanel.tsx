import { PS_EVENT_LABELS, PS_EVENT_IDS } from './shared/eventMeta';
import { type PSFilters, getDefaultPSFilters } from './shared/filterTypes';
import {
  TimeDualSlider,
  SearchableFilterList,
  CollapsibleSection,
  ToggleSwitch,
} from '../../components/filter';

interface Props {
  filters: PSFilters;
  onFiltersChange: (f: PSFilters) => void;
  availableMachines: string[];
}

export default function PSFilterPanel({ filters, onFiltersChange, availableMachines }: Props) {
  const updateFilter = <K extends keyof PSFilters>(key: K, value: PSFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-4 space-y-3">
      {/* Time Range */}
      <TimeDualSlider
        timeStart={filters.timeStart}
        timeEnd={filters.timeEnd}
        onTimeStartChange={(v) => updateFilter('timeStart', v)}
        onTimeEndChange={(v) => updateFilter('timeEnd', v)}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Event Types */}
      <SearchableFilterList
        title="Events"
        items={PS_EVENT_IDS}
        filterMap={filters.eventFilters}
        onFilterMapChange={(m) => updateFilter('eventFilters', m)}
        labelFn={(id) => String(id)}
        subFn={(id) => PS_EVENT_LABELS[id]}
        quickActions={[{ label: 'Clear', onClick: () => updateFilter('eventFilters', new Map()) }]}
        searchable={false}
        defaultHeight={120}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Level filter */}
      <CollapsibleSection title="Level">
        <ToggleSwitch
          checked={filters.levelFilter === 'warning-only'}
          onChange={() => updateFilter('levelFilter', filters.levelFilter === 'all' ? 'warning-only' : 'all')}
          label="Suspicious only (Warning level)"
          activeColor="bg-[#f0883e]"
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
        onClick={() => onFiltersChange(getDefaultPSFilters())}
        className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border border-[#30363d] hover:border-[#3d444d] rounded-md transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
