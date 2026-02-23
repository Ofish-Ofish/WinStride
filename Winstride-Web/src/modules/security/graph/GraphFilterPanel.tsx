import { useState, useMemo, useEffect } from 'react';
import { EVENT_LABELS, LOGON_TYPE_LABELS, FAILURE_STATUS_LABELS, isSystemAccount, EVENT_CATEGORIES, ALL_EVENT_IDS, ALL_LOGON_TYPES } from '../shared/eventMeta';
import { type GraphFilters, getDefaultFilters } from '../shared/filterTypes';
import {
  type FilterState,
  countVisible,
  cycleMap,
  injectFilterStyles,
  TimeDualSlider,
  SearchableFilterList,
  CollapsibleSection,
  QuickAction,
  TriStateCheckbox,
  ResizableList,
  DualRangeTrack,
  ToggleSwitch,
  SeverityFilter,
} from '../../../components/filter';
import PresetBar from '../shared/PresetBar';

// Re-export shared symbols for existing consumers
export { type FilterState, type GraphFilters, DEFAULT_FILTERS, getDefaultFilters, countVisible, resolveTriState } from '../shared/filterTypes';
export { ALL_EVENT_IDS } from '../shared/eventMeta';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACTIVITY_SLIDER_CAP = 50;

interface Props {
  filters: GraphFilters;
  onFiltersChange: (f: GraphFilters) => void;
  availableMachines: string[];
  availableUsers: string[];
  availableIps?: string[];
  availableAuthPackages?: string[];
  availableProcesses?: string[];
  availableFailureStatuses?: string[];
  maxActivity: number;
}

/* ------------------------------------------------------------------ */
/*  Security-specific helpers                                          */
/* ------------------------------------------------------------------ */

function getCategoryState(ids: number[], filterMap: Map<number, FilterState>): FilterState | 'mixed' | undefined {
  const states = ids.map((id) => filterMap.get(id));
  const first = states[0];
  if (states.every((s) => s === first)) return first;
  return 'mixed';
}

function cycleCategory(ids: number[], filterMap: Map<number, FilterState>): Map<number, FilterState> {
  const state = getCategoryState(ids, filterMap);
  const next = new Map(filterMap);
  if (state === undefined || state === 'mixed') {
    for (const id of ids) next.set(id, 'select');
  } else if (state === 'select') {
    for (const id of ids) next.set(id, 'exclude');
  } else {
    for (const id of ids) next.delete(id);
  }
  return next;
}

/* ------------------------------------------------------------------ */
/*  Security-specific subcomponents                                    */
/* ------------------------------------------------------------------ */

function TriStateCategoryHeader({
  state,
  onCycle,
  label,
}: {
  state: FilterState | 'mixed' | undefined;
  onCycle: () => void;
  label: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      className="flex items-center gap-2 mb-1 group"
    >
      <div
        className={`w-[14px] h-[14px] rounded-[3px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all ${
          state === 'select'
            ? 'bg-[#58a6ff] border-[#58a6ff]'
            : state === 'exclude'
              ? 'bg-[#f85149] border-[#f85149]'
              : state === 'mixed'
                ? 'border-[#58a6ff]/60 bg-[#58a6ff]/20'
                : 'border-[#3d444d] group-hover:border-[#58a6ff]/50'
        }`}
      >
        {state === 'select' && (
          <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {state === 'exclude' && (
          <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {state === 'mixed' && <div className="w-1.5 h-[2px] bg-[#58a6ff] rounded-full" />}
      </div>
      <span className="text-[12px] font-medium text-gray-400 group-hover:text-gray-200 transition-colors uppercase tracking-wide">
        {label}
      </span>
    </button>
  );
}

function TriStateLegend() {
  return (
    <div className="flex items-center gap-3 mb-2 px-1">
      <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
        <span className="w-2.5 h-2.5 rounded-sm bg-[#58a6ff] inline-flex items-center justify-center">
          <svg className="w-1.5 h-1.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        Select
      </span>
      <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
        <span className="w-2.5 h-2.5 rounded-sm bg-[#f85149] inline-flex items-center justify-center">
          <svg className="w-1.5 h-1.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
        Exclude
      </span>
      <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
        <span className="w-2.5 h-2.5 rounded-sm border border-[#3d444d] inline-block" />
        Off
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function GraphFilterPanel({
  filters,
  onFiltersChange,
  availableMachines,
  availableUsers,
  availableIps = [],
  availableAuthPackages = [],
  availableProcesses = [],
  availableFailureStatuses = [],
  maxActivity,
}: Props) {
  injectFilterStyles();

  const updateFilter = <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  /* ---- Activity dual slider (local state) ---- */
  const activityCeiling = Math.min(maxActivity, ACTIVITY_SLIDER_CAP);
  const sliderRange = Math.max(activityCeiling - 1, 1);

  const [localActMin, setLocalActMin] = useState(filters.activityMin);
  const [localActMax, setLocalActMax] = useState(() =>
    filters.activityMax === Infinity ? activityCeiling : Math.min(filters.activityMax, activityCeiling),
  );

  useEffect(() => {
    setLocalActMin(filters.activityMin);
  }, [filters.activityMin]);

  useEffect(() => {
    setLocalActMax(filters.activityMax === Infinity ? activityCeiling : Math.min(filters.activityMax, activityCeiling));
  }, [filters.activityMax, activityCeiling]);

  const minPct = ((localActMin - 1) / sliderRange) * 100;
  const maxPct = ((localActMax - 1) / sliderRange) * 100;

  const activityDisplay = (() => {
    if (localActMax >= activityCeiling) {
      return localActMin === 1 ? 'All' : `\u2265 ${localActMin}`;
    }
    return `${localActMin} – ${localActMax}`;
  })();

  /* ---- Event counts ---- */
  const eventVisibleCount = countVisible(ALL_EVENT_IDS, filters.eventFilters);

  /* ---- User helpers ---- */
  const visibleUsers = useMemo(
    () => filters.hideMachineAccounts
      ? availableUsers.filter((u) => !isSystemAccount(u))
      : availableUsers,
    [availableUsers, filters.hideMachineAccounts],
  );

  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-4 space-y-3">
      <TriStateLegend />

      {/* Presets */}
      <CollapsibleSection title="Presets" defaultOpen={false}>
        <PresetBar filters={filters} onFiltersChange={onFiltersChange} />
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Time Range */}
      <TimeDualSlider
        timeStart={filters.timeStart}
        timeEnd={filters.timeEnd}
        onTimeStartChange={(v) => updateFilter('timeStart', v)}
        onTimeEndChange={(v) => updateFilter('timeEnd', v)}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Min Risk Level */}
      <SeverityFilter
        value={filters.minSeverity}
        onChange={(v) => updateFilter('minSeverity', v)}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Activity */}
      <CollapsibleSection
        title="Activity"
        right={<span className="text-[12px] font-medium text-[#58a6ff]">{activityDisplay}</span>}
      >
        {activityCeiling < 2 ? (
          <div className="text-[12px] text-gray-500 py-1">All activity: 1</div>
        ) : (
          <>
            <div className="relative h-5">
              <DualRangeTrack minPct={minPct} maxPct={maxPct} />
              <input
                type="range"
                className="gf-slider-dual"
                min={1}
                max={activityCeiling}
                step={1}
                value={localActMin}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), localActMax);
                  setLocalActMin(val);
                  updateFilter('activityMin', val);
                }}
              />
              <input
                type="range"
                className="gf-slider-dual"
                min={1}
                max={activityCeiling}
                step={1}
                value={localActMax}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), localActMin);
                  setLocalActMax(val);
                  updateFilter('activityMax', val >= activityCeiling ? Infinity : val);
                }}
              />
            </div>
            <div className="flex justify-between mt-1 px-0.5">
              <span className="text-[9px] text-gray-600 select-none">1</span>
              <span className="text-[9px] text-gray-600 select-none">{activityCeiling}</span>
            </div>
          </>
        )}
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Event Types */}
      <CollapsibleSection
        title="Events"
        right={
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-gray-600">
              {eventVisibleCount}/{ALL_EVENT_IDS.length}
            </span>
            <QuickAction label="Clear" onClick={() => updateFilter('eventFilters', new Map())} />
            <QuickAction
              label="Auth"
              onClick={() => updateFilter('eventFilters', new Map<number, FilterState>([[4624, 'select'], [4625, 'select'], [4634, 'select']]))}
            />
          </div>
        }
      >
        <ResizableList defaultHeight={240}>
          <div className="space-y-2">
            {EVENT_CATEGORIES.map((cat) => {
              const catState = getCategoryState(cat.ids, filters.eventFilters);
              return (
                <div key={cat.name}>
                  <TriStateCategoryHeader
                    state={catState}
                    onCycle={() => updateFilter('eventFilters', cycleCategory(cat.ids, filters.eventFilters))}
                    label={cat.name}
                  />
                  <div className="ml-0.5">
                    {cat.ids.map((id) => (
                      <TriStateCheckbox
                        key={id}
                        state={filters.eventFilters.get(id)}
                        onCycle={() => updateFilter('eventFilters', cycleMap(filters.eventFilters, id))}
                        label={String(id)}
                        sub={EVENT_LABELS[id]}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ResizableList>
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Logon Types */}
      <SearchableFilterList
        title="Logon Types"
        items={ALL_LOGON_TYPES}
        filterMap={filters.logonTypeFilters}
        onFilterMapChange={(m) => updateFilter('logonTypeFilters', m)}
        labelFn={(lt) => String(lt)}
        subFn={(lt) => LOGON_TYPE_LABELS[lt]}
        quickActions={[{ label: 'Clear', onClick: () => updateFilter('logonTypeFilters', new Map()) }]}
        searchable={false}
        defaultHeight={200}
      />

      <div className="h-px bg-[#21262d]" />

      {/* Users */}
      {availableUsers.length > 0 && (
        <>
          <SearchableFilterList
            title="Users"
            items={visibleUsers}
            filterMap={filters.userFilters}
            onFilterMapChange={(m) => updateFilter('userFilters', m)}
            quickActions={[
              { label: 'Clear', onClick: () => updateFilter('userFilters', new Map()) },
              { label: 'Exclude All', onClick: () => {
                const next = new Map(filters.userFilters);
                for (const u of visibleUsers) next.set(u, 'exclude');
                updateFilter('userFilters', next);
              }},
            ]}
            headerSlot={
              <ToggleSwitch
                checked={filters.hideMachineAccounts}
                onChange={(v) => updateFilter('hideMachineAccounts', v)}
                label="Hide system accounts"
              />
            }
            defaultHeight={160}
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
            quickActions={[
              { label: 'Clear', onClick: () => updateFilter('machineFilters', new Map()) },
              { label: 'Exclude All', onClick: () => {
                const next = new Map(filters.machineFilters);
                for (const m of availableMachines) next.set(m, 'exclude');
                updateFilter('machineFilters', next);
              }},
            ]}
            defaultHeight={160}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* IPs */}
      {availableIps.length > 0 && (
        <>
          <SearchableFilterList
            title="IP Addresses"
            items={availableIps}
            filterMap={filters.ipFilters}
            onFilterMapChange={(m) => updateFilter('ipFilters', m)}
            quickActions={[{ label: 'Clear', onClick: () => updateFilter('ipFilters', new Map()) }]}
            defaultOpen={false}
            defaultHeight={120}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Auth Packages */}
      {availableAuthPackages.length > 0 && (
        <>
          <SearchableFilterList
            title="Auth Package"
            items={availableAuthPackages}
            filterMap={filters.authPackageFilters}
            onFilterMapChange={(m) => updateFilter('authPackageFilters', m)}
            quickActions={[{ label: 'Clear', onClick: () => updateFilter('authPackageFilters', new Map()) }]}
            searchable={false}
            defaultOpen={false}
            defaultHeight={100}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Processes */}
      {availableProcesses.length > 0 && (
        <>
          <SearchableFilterList
            title="Processes"
            items={availableProcesses}
            filterMap={filters.processFilters}
            onFilterMapChange={(m) => updateFilter('processFilters', m)}
            labelFn={(p) => p.replace(/^.*[/\\]/, '')}
            subFn={(p) => (p.includes('\\') || p.includes('/') ? p : undefined)}
            quickActions={[{ label: 'Clear', onClick: () => updateFilter('processFilters', new Map()) }]}
            defaultOpen={false}
            defaultHeight={120}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Failure Status */}
      {availableFailureStatuses.length > 0 && (
        <>
          <SearchableFilterList
            title="Failure Status"
            items={availableFailureStatuses}
            filterMap={filters.failureStatusFilters}
            onFilterMapChange={(m) => updateFilter('failureStatusFilters', m)}
            subFn={(s) => FAILURE_STATUS_LABELS[s.toLowerCase()]}
            quickActions={[{ label: 'Clear', onClick: () => updateFilter('failureStatusFilters', new Map()) }]}
            searchable={false}
            defaultOpen={false}
            defaultHeight={120}
          />
          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Elevated Token */}
      <ToggleSwitch
        checked={filters.showElevatedOnly}
        onChange={(v) => updateFilter('showElevatedOnly', v)}
        label="Elevated / Admin only"
      />

      <div className="h-px bg-[#21262d]" />

      {/* Reset */}
      <button
        onClick={() => onFiltersChange(getDefaultFilters())}
        className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border border-[#30363d] hover:border-[#3d444d] rounded-md transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
