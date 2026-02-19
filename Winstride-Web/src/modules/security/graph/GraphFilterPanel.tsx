import { useState, useMemo, useCallback } from 'react';
import { EVENT_LABELS, LOGON_TYPE_LABELS, isSystemAccount } from './transformEvents';
import PresetBar from './PresetBar';

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

export type FilterState = 'select' | 'exclude';

export interface GraphFilters {
  eventFilters: Map<number, FilterState>;
  timeStart: string;   // ISO string or '' (unbounded = all time)
  timeEnd: string;     // ISO string or '' (unbounded = now)
  machineFilters: Map<string, FilterState>;
  userFilters: Map<string, FilterState>;
  logonTypeFilters: Map<number, FilterState>;
  activityMin: number; // default 1
  activityMax: number; // default Infinity (no upper cap)
  hideMachineAccounts: boolean;
}

export function getDefaultFilters(): GraphFilters {
  return {
    eventFilters: new Map<number, FilterState>([[4624, 'select'], [4625, 'select'], [4634, 'select']]),
    timeStart: new Date(Date.now() - 259_200_000).toISOString(), // 3d ago
    timeEnd: '',
    machineFilters: new Map(),
    userFilters: new Map(),
    logonTypeFilters: new Map(),
    activityMin: 1,
    activityMax: Infinity,
    hideMachineAccounts: true,
  };
}

export const DEFAULT_FILTERS: GraphFilters = getDefaultFilters();

/** Dual slider steps — left = furthest back, right = most recent */
const TIME_DUAL_STEPS: { label: string; offset: number }[] = [
  { label: 'All', offset: Infinity },
  { label: '30d', offset: 2_592_000_000 },
  { label: '7d',  offset: 604_800_000 },
  { label: '3d',  offset: 259_200_000 },
  { label: '48h', offset: 172_800_000 },
  { label: '24h', offset: 86_400_000 },
  { label: '12h', offset: 43_200_000 },
  { label: '6h',  offset: 21_600_000 },
  { label: '3h',  offset: 10_800_000 },
  { label: '1h',  offset: 3_600_000 },
  { label: '30m', offset: 1_800_000 },
  { label: '15m', offset: 900_000 },
  { label: 'Now', offset: 0 },
];

const ACTIVITY_SLIDER_CAP = 50;

const EVENT_CATEGORIES: { name: string; ids: number[] }[] = [
  { name: 'Authentication', ids: [4624, 4625, 4634, 4647, 4648] },
  { name: 'Privileges', ids: [4672] },
  { name: 'Account Mgmt', ids: [4720, 4722, 4723, 4724, 4725, 4726, 4738, 4740, 4767] },
  { name: 'Group Changes', ids: [4728, 4732, 4733, 4756] },
  { name: 'Kerberos & NTLM', ids: [4768, 4769, 4776] },
  { name: 'Object Access', ids: [4662, 4798, 4799, 5379] },
];

export const ALL_EVENT_IDS = Object.keys(EVENT_LABELS).map(Number);
const ALL_LOGON_TYPES = Object.keys(LOGON_TYPE_LABELS).map(Number);

interface Props {
  filters: GraphFilters;
  onFiltersChange: (f: GraphFilters) => void;
  availableMachines: string[];
  availableUsers: string[];
  maxActivity: number;
}

/* ------------------------------------------------------------------ */
/*  Slider Styles (injected once)                                      */
/* ------------------------------------------------------------------ */

const SLIDER_CSS = `
.gf-slider{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;height:20px;width:100%;position:relative;z-index:2}
.gf-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#58a6ff;border:2px solid #0d1117;box-shadow:0 0 8px rgba(88,166,255,0.35);margin-top:-6px;transition:box-shadow .15s}
.gf-slider::-webkit-slider-thumb:hover{box-shadow:0 0 12px rgba(88,166,255,0.55)}
.gf-slider::-webkit-slider-runnable-track{height:4px;background:transparent;border-radius:2px}
.gf-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#58a6ff;border:2px solid #0d1117;box-shadow:0 0 8px rgba(88,166,255,0.35)}
.gf-slider::-moz-range-track{height:4px;background:transparent;border-radius:2px;border:none}
.gf-slider-dual{-webkit-appearance:none;appearance:none;background:transparent;height:20px;width:100%;position:absolute;top:0;left:0;pointer-events:none;z-index:3}
.gf-slider-dual::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;width:16px;height:16px;border-radius:50%;background:#58a6ff;border:2px solid #0d1117;box-shadow:0 0 8px rgba(88,166,255,0.35);margin-top:-6px;transition:box-shadow .15s;cursor:pointer}
.gf-slider-dual::-webkit-slider-thumb:hover{box-shadow:0 0 12px rgba(88,166,255,0.55)}
.gf-slider-dual::-webkit-slider-runnable-track{height:4px;background:transparent;border-radius:2px}
.gf-slider-dual::-moz-range-thumb{pointer-events:auto;width:14px;height:14px;border-radius:50%;background:#58a6ff;border:2px solid #0d1117;box-shadow:0 0 8px rgba(88,166,255,0.35);cursor:pointer}
.gf-slider-dual::-moz-range-track{height:4px;background:transparent;border-radius:2px;border:none}
.gf-scrollbar::-webkit-scrollbar{width:6px}
.gf-scrollbar::-webkit-scrollbar-track{background:transparent}
.gf-scrollbar::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
.gf-scrollbar::-webkit-scrollbar-thumb:hover{background:#3d444d}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = SLIDER_CSS;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function countVisible<T>(items: T[], filterMap: Map<T, FilterState>): number {
  const selected = items.filter((i) => filterMap.get(i) === 'select');
  if (selected.length > 0) return selected.length;
  const excluded = items.filter((i) => filterMap.get(i) === 'exclude');
  return items.length - excluded.length;
}

/** Resolve a tri-state Map into the effective set of allowed items. */
export function resolveTriState<T>(allItems: T[], filterMap: Map<T, FilterState>): T[] {
  const selected = allItems.filter((i) => filterMap.get(i) === 'select');
  if (selected.length > 0) return selected;
  const excludedSet = new Set(allItems.filter((i) => filterMap.get(i) === 'exclude'));
  if (excludedSet.size > 0) return allItems.filter((i) => !excludedSet.has(i));
  return allItems;
}

function cycleMap<T>(map: Map<T, FilterState>, key: T): Map<T, FilterState> {
  const next = new Map(map);
  const current = next.get(key);
  if (current === undefined) next.set(key, 'select');
  else if (current === 'select') next.set(key, 'exclude');
  else next.delete(key);
  return next;
}

function getCategoryState(ids: number[], filterMap: Map<number, FilterState>): FilterState | 'mixed' | undefined {
  const states = ids.map((id) => filterMap.get(id));
  const first = states[0];
  if (states.every((s) => s === first)) return first; // all same (including all undefined = off)
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
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function DualRangeTrack({ minPct, maxPct }: { minPct: number; maxPct: number }) {
  return (
    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-[#21262d] pointer-events-none">
      <div
        className="h-full rounded-full absolute transition-all duration-75"
        style={{
          left: `${minPct}%`,
          width: `${Math.max(0, maxPct - minPct)}%`,
          background: 'linear-gradient(90deg, #1f6feb, #58a6ff)',
        }}
      />
    </div>
  );
}


function CollapsibleSection({
  title,
  right,
  children,
  defaultOpen = true,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 group"
        >
          <svg
            className={`w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
          >
            <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[11px] font-semibold text-gray-500 group-hover:text-gray-300 uppercase tracking-widest select-none transition-colors">
            {title}
          </span>
        </button>
        {open && right}
      </div>
      {open && children}
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="px-2 py-0.5 text-[11px] rounded border border-[#30363d] text-[#58a6ff]/80 hover:text-[#58a6ff] hover:border-[#58a6ff]/40 hover:bg-[#58a6ff]/5 transition-all"
    >
      {label}
    </button>
  );
}

function TriStateCheckbox({
  state,
  onCycle,
  label,
  sub,
}: {
  state: FilterState | undefined;
  onCycle: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      className="flex items-center gap-2.5 px-2 py-[5px] rounded-md hover:bg-[#1c2128] cursor-pointer group transition-colors select-none"
    >
      <div
        className={`w-[15px] h-[15px] rounded-[3px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all ${
          state === 'select'
            ? 'bg-[#58a6ff] border-[#58a6ff]'
            : state === 'exclude'
              ? 'bg-[#f85149] border-[#f85149]'
              : 'border-[#3d444d] group-hover:border-[#58a6ff]/50'
        }`}
      >
        {state === 'select' && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {state === 'exclude' && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span className={`text-[13px] leading-tight ${
        state === 'exclude' ? 'text-gray-500 line-through' : 'text-gray-300'
      }`}>
        {label}
        {sub && <span className={`ml-1.5 ${state === 'exclude' ? 'text-gray-600' : 'text-gray-500'}`}>— {sub}</span>}
      </span>
    </div>
  );
}

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

function ResizableList({
  children,
  defaultHeight,
  minHeight = 60,
}: {
  children: React.ReactNode;
  defaultHeight: number;
  minHeight?: number;
}) {
  const [height, setHeight] = useState(defaultHeight);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = height;
      const onMove = (ev: MouseEvent) => {
        setHeight(Math.max(minHeight, startH + ev.clientY - startY));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [height, minHeight],
  );

  return (
    <div>
      <div
        className="overflow-y-auto gf-scrollbar pr-1"
        style={{ height }}
      >
        {children}
      </div>
      <div
        onMouseDown={onDragStart}
        className="flex items-center justify-center h-3 cursor-row-resize group"
      >
        <div className="w-8 h-[3px] rounded-full bg-[#21262d] group-hover:bg-[#58a6ff]/50 transition-colors" />
      </div>
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
  maxActivity,
}: Props) {
  injectStyles();

  const [machineSearch, setMachineSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const updateFilter = <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  /* ---- Time dual slider ---- */
  const timeStartIdx = useMemo(() => {
    if (!filters.timeStart) return 0; // "All"
    const elapsed = Date.now() - new Date(filters.timeStart).getTime();
    for (let i = 1; i < TIME_DUAL_STEPS.length - 1; i++) {
      if (Math.abs(elapsed - TIME_DUAL_STEPS[i].offset) < 300_000) return i;
    }
    return 0;
  }, [filters.timeStart]);

  const timeEndIdx = useMemo(() => {
    if (!filters.timeEnd) return TIME_DUAL_STEPS.length - 1; // "Now"
    const elapsed = Date.now() - new Date(filters.timeEnd).getTime();
    for (let i = 1; i < TIME_DUAL_STEPS.length - 1; i++) {
      if (Math.abs(elapsed - TIME_DUAL_STEPS[i].offset) < 300_000) return i;
    }
    return TIME_DUAL_STEPS.length - 1;
  }, [filters.timeEnd]);

  const timeMaxIdx = TIME_DUAL_STEPS.length - 1;
  const timeMinPct = (timeStartIdx / timeMaxIdx) * 100;
  const timeMaxPct = (timeEndIdx / timeMaxIdx) * 100;

  const timeDisplayLabel = timeStartIdx === 0 && timeEndIdx === TIME_DUAL_STEPS.length - 1
    ? 'All'
    : `${TIME_DUAL_STEPS[timeStartIdx].label} — ${TIME_DUAL_STEPS[timeEndIdx].label}`;

  /* ---- Activity dual slider ---- */
  const activityCeiling = Math.min(maxActivity, ACTIVITY_SLIDER_CAP);
  const effectiveActivityMax = filters.activityMax === Infinity ? activityCeiling : Math.min(filters.activityMax, activityCeiling);
  const sliderRange = Math.max(activityCeiling - 1, 1);
  const minPct = ((filters.activityMin - 1) / sliderRange) * 100;
  const maxPct = ((effectiveActivityMax - 1) / sliderRange) * 100;

  const activityDisplay = (() => {
    const min = filters.activityMin;
    if (filters.activityMax === Infinity || filters.activityMax >= activityCeiling) {
      return min === 1 ? 'All' : `\u2265 ${min}`;
    }
    return `${min} – ${filters.activityMax}`;
  })();

  /* ---- Event counts ---- */
  const eventVisibleCount = countVisible(ALL_EVENT_IDS, filters.eventFilters);
  const logonTypeVisibleCount = countVisible(ALL_LOGON_TYPES, filters.logonTypeFilters);

  /* ---- Machine helpers ---- */
  const filteredMachines = useMemo(
    () => availableMachines.filter((m) => m.toLowerCase().includes(machineSearch.toLowerCase())),
    [availableMachines, machineSearch],
  );
  const visibleMachineCount = countVisible(availableMachines, filters.machineFilters);

  /* ---- User helpers ---- */
  const visibleUsers = useMemo(
    () => filters.hideMachineAccounts
      ? availableUsers.filter((u) => !isSystemAccount(u))
      : availableUsers,
    [availableUsers, filters.hideMachineAccounts],
  );
  const filteredUsers = useMemo(
    () => visibleUsers.filter((u) => u.toLowerCase().includes(userSearch.toLowerCase())),
    [visibleUsers, userSearch],
  );
  const visibleUserCount = countVisible(visibleUsers, filters.userFilters);

  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-4 space-y-3">
      <TriStateLegend />

      {/* Presets */}
      <CollapsibleSection title="Presets" defaultOpen={false}>
        <PresetBar filters={filters} onFiltersChange={onFiltersChange} />
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Time Range */}
      <CollapsibleSection
        title="Time Range"
        right={
          <span className="text-[12px] font-medium text-[#58a6ff]">
            {timeDisplayLabel}
          </span>
        }
      >
        <div className="relative h-5">
          <DualRangeTrack minPct={timeMinPct} maxPct={timeMaxPct} />
          <input
            type="range"
            className="gf-slider-dual"
            min={0}
            max={TIME_DUAL_STEPS.length - 1}
            step={1}
            value={timeStartIdx}
            onChange={(e) => {
              const idx = Math.min(Number(e.target.value), timeEndIdx);
              const step = TIME_DUAL_STEPS[idx];
              updateFilter('timeStart', step.offset === Infinity ? '' : new Date(Date.now() - step.offset).toISOString());
            }}
          />
          <input
            type="range"
            className="gf-slider-dual"
            min={0}
            max={TIME_DUAL_STEPS.length - 1}
            step={1}
            value={timeEndIdx}
            onChange={(e) => {
              const idx = Math.max(Number(e.target.value), timeStartIdx);
              const step = TIME_DUAL_STEPS[idx];
              updateFilter('timeEnd', step.offset === 0 ? '' : new Date(Date.now() - step.offset).toISOString());
            }}
          />
        </div>
        <div className="flex justify-between mt-1 px-0.5">
          {TIME_DUAL_STEPS.map((step) => (
            <span key={step.label} className="text-[9px] text-gray-600 select-none">
              {step.label}
            </span>
          ))}
        </div>
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Activity */}
      <CollapsibleSection
        title="Activity"
        right={
          <span className="text-[12px] font-medium text-[#58a6ff]">
            {activityDisplay}
          </span>
        }
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
                value={filters.activityMin}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), effectiveActivityMax);
                  updateFilter('activityMin', val);
                }}
              />
              <input
                type="range"
                className="gf-slider-dual"
                min={1}
                max={activityCeiling}
                step={1}
                value={effectiveActivityMax}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), filters.activityMin);
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
      <CollapsibleSection
        title="Logon Types"
        right={
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-gray-600">
              {logonTypeVisibleCount}/{ALL_LOGON_TYPES.length}
            </span>
            <QuickAction
              label="Clear"
              onClick={() => updateFilter('logonTypeFilters', new Map())}
            />
          </div>
        }
      >
        <ResizableList defaultHeight={200}>
          <div className="space-y-0.5">
            {Object.entries(LOGON_TYPE_LABELS).map(([ltStr, label]) => {
              const lt = Number(ltStr);
              return (
                <TriStateCheckbox
                  key={lt}
                  state={filters.logonTypeFilters.get(lt)}
                  onCycle={() => updateFilter('logonTypeFilters', cycleMap(filters.logonTypeFilters, lt))}
                  label={`${lt}`}
                  sub={label}
                />
              );
            })}
          </div>
        </ResizableList>
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Users */}
      {availableUsers.length > 0 && (
        <>
          <CollapsibleSection
            title="Users"
            right={
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-gray-600">
                  {visibleUserCount}/{visibleUsers.length}
                </span>
                <QuickAction
                  label="Clear"
                  onClick={() => updateFilter('userFilters', new Map())}
                />
                <QuickAction
                  label="Exclude All"
                  onClick={() => {
                    const next = new Map(filters.userFilters);
                    for (const u of visibleUsers) next.set(u, 'exclude');
                    updateFilter('userFilters', next);
                  }}
                />
              </div>
            }
          >
            <div
              onClick={(e) => { e.stopPropagation(); updateFilter('hideMachineAccounts', !filters.hideMachineAccounts); }}
              className="flex items-center gap-2 mb-2 cursor-pointer select-none"
            >
              <div
                className={`relative w-7 h-4 rounded-full transition-colors flex-shrink-0 ${
                  filters.hideMachineAccounts ? 'bg-[#58a6ff]' : 'bg-[#30363d]'
                }`}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white shadow transition-transform ${
                    filters.hideMachineAccounts ? 'translate-x-[12px]' : 'translate-x-0'
                  }`}
                />
              </div>
              <span className="text-[11px] text-gray-400">Hide system accounts</span>
            </div>

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
                value={userSearch}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1 text-[12px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors"
              />
            </div>

            <ResizableList defaultHeight={160}>
              <div className="space-y-0.5">
                {filteredUsers.length === 0 && (
                  <div className="text-[12px] text-gray-600 py-1">No users found</div>
                )}
                {filteredUsers.map((user) => (
                  <TriStateCheckbox
                    key={user}
                    state={filters.userFilters.get(user)}
                    onCycle={() => updateFilter('userFilters', cycleMap(filters.userFilters, user))}
                    label={user}
                  />
                ))}
              </div>
            </ResizableList>
          </CollapsibleSection>

          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Machines */}
      {availableMachines.length > 0 && (
        <>
          <CollapsibleSection
            title="Machines"
            right={
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-gray-600">
                  {visibleMachineCount}/{availableMachines.length}
                </span>
                <QuickAction
                  label="Clear"
                  onClick={() => updateFilter('machineFilters', new Map())}
                />
                <QuickAction
                  label="Exclude All"
                  onClick={() => {
                    const next = new Map(filters.machineFilters);
                    for (const m of availableMachines) next.set(m, 'exclude');
                    updateFilter('machineFilters', next);
                  }}
                />
              </div>
            }
          >
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
                value={machineSearch}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setMachineSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1 text-[12px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors"
              />
            </div>

            <ResizableList defaultHeight={160}>
              <div className="space-y-0.5">
                {filteredMachines.length === 0 && (
                  <div className="text-[12px] text-gray-600 py-1">No machines found</div>
                )}
                {filteredMachines.map((machine) => (
                  <TriStateCheckbox
                    key={machine}
                    state={filters.machineFilters.get(machine)}
                    onCycle={() => updateFilter('machineFilters', cycleMap(filters.machineFilters, machine))}
                    label={machine}
                  />
                ))}
              </div>
            </ResizableList>
          </CollapsibleSection>

          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Reset */}
      <button
        onClick={() => {
          const fresh = getDefaultFilters();
          onFiltersChange(fresh);
        }}
        className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border border-[#30363d] hover:border-[#3d444d] rounded-md transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
