import { SYSMON_EVENT_LABELS, SYSMON_EVENT_IDS, INTEGRITY_LEVELS } from './shared/eventMeta';
import { type SysmonFilters, getDefaultSysmonFilters } from './shared/filterTypes';
import {
  TimeDualSlider,
  SearchableFilterList,
  CollapsibleSection,
  TriStateCheckbox,
  cycleMap,
  SeverityFilter,
} from '../../components/filter';

interface Props {
  filters: SysmonFilters;
  onFiltersChange: (f: SysmonFilters) => void;
  availableMachines: string[];
  availableProcesses: string[];
  availableUsers: string[];
}

export default function SysmonFilterPanel({
  filters,
  onFiltersChange,
  availableMachines,
  availableProcesses,
  availableUsers,
}: Props) {
  const updateFilter = <K extends keyof SysmonFilters>(key: K, value: SysmonFilters[K]) => {
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
        items={SYSMON_EVENT_IDS}
        filterMap={filters.eventFilters}
        onFilterMapChange={(m) => updateFilter('eventFilters', m)}
        labelFn={(id) => String(id)}
        subFn={(id) => SYSMON_EVENT_LABELS[id]}
        quickActions={[{ label: 'Clear', onClick: () => updateFilter('eventFilters', new Map()) }]}
        searchable={false}
        defaultHeight={200}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Risk Level */}
      <SeverityFilter
        value={filters.severityFilter}
        onChange={(v) => updateFilter('severityFilter', v)}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Integrity Level */}
      <CollapsibleSection title="Integrity Level" defaultOpen={false}>
        <div className="space-y-0.5">
          {INTEGRITY_LEVELS.map((level) => (
            <TriStateCheckbox
              key={level}
              state={filters.integrityFilters.get(level)}
              onCycle={() => updateFilter('integrityFilters', cycleMap(filters.integrityFilters, level))}
              label={level}
            />
          ))}
        </div>
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Processes */}
      {availableProcesses.length > 0 && (
        <>
          <SearchableFilterList
            title="Processes"
            items={availableProcesses}
            filterMap={filters.processFilters}
            onFilterMapChange={(m) => updateFilter('processFilters', m)}
            quickActions={[{ label: 'Clear', onClick: () => updateFilter('processFilters', new Map()) }]}
            defaultOpen={false}
            defaultHeight={140}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Users */}
      {availableUsers.length > 0 && (
        <>
          <SearchableFilterList
            title="Users"
            items={availableUsers}
            filterMap={filters.userFilters}
            onFilterMapChange={(m) => updateFilter('userFilters', m)}
            quickActions={[{ label: 'Clear', onClick: () => updateFilter('userFilters', new Map()) }]}
            defaultOpen={false}
            defaultHeight={140}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Machines */}
      {availableMachines.length > 0 && (
        <>
          <SearchableFilterList
            title="Machines"
            items={availableMachines}
            filterMap={filters.machineFilters}
            onFilterMapChange={(m) => updateFilter('machineFilters', m)}
            quickActions={[{ label: 'Clear', onClick: () => updateFilter('machineFilters', new Map()) }]}
            defaultHeight={140}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Reset */}
      <button
        onClick={() => onFiltersChange(getDefaultSysmonFilters())}
        className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border border-[#30363d] hover:border-[#3d444d] rounded-md transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
