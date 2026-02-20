import { useState, useMemo, useCallback, useEffect } from 'react';
import { SYSMON_EVENT_LABELS, SYSMON_EVENT_IDS, INTEGRITY_LEVELS } from './shared/eventMeta';
import { type SysmonFilters, type FilterState, getDefaultSysmonFilters } from './shared/filterTypes';
import { countVisible, cycleMap } from '../security/shared/filterTypes';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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
      <div className="overflow-y-auto gf-scrollbar pr-1" style={{ height }}>
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
  const [machineSearch, setMachineSearch] = useState('');
  const [processSearch, setProcessSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const updateFilter = <K extends keyof SysmonFilters>(key: K, value: SysmonFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  /* ---- Time dual slider (local state to avoid jitter) ---- */
  const timeMaxIdx = TIME_DUAL_STEPS.length - 1;

  function timeOffsetToIdx(isoStr: string, fallback: number): number {
    if (!isoStr) return fallback;
    const elapsed = Date.now() - new Date(isoStr).getTime();
    let best = fallback;
    let bestDiff = Infinity;
    for (let i = 0; i <= timeMaxIdx; i++) {
      const diff = Math.abs(elapsed - TIME_DUAL_STEPS[i].offset);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return best;
  }

  const [timeStartIdx, setTimeStartIdx] = useState(() => timeOffsetToIdx(filters.timeStart, 0));
  const [timeEndIdx, setTimeEndIdx] = useState(() => timeOffsetToIdx(filters.timeEnd, timeMaxIdx));

  useEffect(() => {
    const incoming = timeOffsetToIdx(filters.timeStart, 0);
    if (Math.abs(incoming - timeStartIdx) > 1) setTimeStartIdx(incoming);
  }, [filters.timeStart]);

  useEffect(() => {
    const incoming = timeOffsetToIdx(filters.timeEnd, timeMaxIdx);
    if (Math.abs(incoming - timeEndIdx) > 1) setTimeEndIdx(incoming);
  }, [filters.timeEnd]);

  const timeMinPct = (timeStartIdx / timeMaxIdx) * 100;
  const timeMaxPct = (timeEndIdx / timeMaxIdx) * 100;

  const timeDisplayLabel = timeStartIdx === 0 && timeEndIdx === timeMaxIdx
    ? 'All'
    : `${TIME_DUAL_STEPS[timeStartIdx].label} — ${TIME_DUAL_STEPS[timeEndIdx].label}`;

  /* ---- Counts ---- */
  const eventVisibleCount = countVisible(SYSMON_EVENT_IDS, filters.eventFilters);

  const filteredMachines = useMemo(
    () => availableMachines.filter((m) => m.toLowerCase().includes(machineSearch.toLowerCase())),
    [availableMachines, machineSearch],
  );
  const visibleMachineCount = countVisible(availableMachines, filters.machineFilters);

  const filteredProcesses = useMemo(
    () => availableProcesses.filter((p) => p.toLowerCase().includes(processSearch.toLowerCase())),
    [availableProcesses, processSearch],
  );
  const visibleProcessCount = countVisible(availableProcesses, filters.processFilters);

  const filteredUsers = useMemo(
    () => availableUsers.filter((u) => u.toLowerCase().includes(userSearch.toLowerCase())),
    [availableUsers, userSearch],
  );
  const visibleUserCount = countVisible(availableUsers, filters.userFilters);

  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-4 space-y-3">
      {/* Time Range */}
      <CollapsibleSection
        title="Time Range"
        right={<span className="text-[12px] font-medium text-[#58a6ff]">{timeDisplayLabel}</span>}
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
            <span key={step.label} className="text-[9px] text-gray-600 select-none">{step.label}</span>
          ))}
        </div>
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Event Types */}
      <CollapsibleSection
        title="Events"
        right={
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-gray-600">
              {eventVisibleCount}/{SYSMON_EVENT_IDS.length}
            </span>
            <QuickAction label="Clear" onClick={() => updateFilter('eventFilters', new Map())} />
          </div>
        }
      >
        <div className="space-y-0.5">
          {SYSMON_EVENT_IDS.map((id) => (
            <TriStateCheckbox
              key={id}
              state={filters.eventFilters.get(id)}
              onCycle={() => updateFilter('eventFilters', cycleMap(filters.eventFilters, id))}
              label={String(id)}
              sub={SYSMON_EVENT_LABELS[id]}
            />
          ))}
        </div>
      </CollapsibleSection>

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
          <CollapsibleSection
            title="Processes"
            defaultOpen={false}
            right={
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-gray-600">
                  {visibleProcessCount}/{availableProcesses.length}
                </span>
                <QuickAction label="Clear" onClick={() => updateFilter('processFilters', new Map())} />
              </div>
            }
          >
            <div className="relative mb-2">
              <svg
                className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none"
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              >
                <circle cx="7" cy="7" r="5" />
                <path d="M11 11l3.5 3.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={processSearch}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setProcessSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1 text-[12px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors"
              />
            </div>
            <ResizableList defaultHeight={140}>
              <div className="space-y-0.5">
                {filteredProcesses.length === 0 && (
                  <div className="text-[12px] text-gray-600 py-1">No processes found</div>
                )}
                {filteredProcesses.map((proc) => (
                  <TriStateCheckbox
                    key={proc}
                    state={filters.processFilters.get(proc)}
                    onCycle={() => updateFilter('processFilters', cycleMap(filters.processFilters, proc))}
                    label={proc}
                  />
                ))}
              </div>
            </ResizableList>
          </CollapsibleSection>

          <div className="h-px bg-[#21262d]" />
        </>
      )}

      {/* Users */}
      {availableUsers.length > 0 && (
        <>
          <CollapsibleSection
            title="Users"
            defaultOpen={false}
            right={
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-gray-600">
                  {visibleUserCount}/{availableUsers.length}
                </span>
                <QuickAction label="Clear" onClick={() => updateFilter('userFilters', new Map())} />
              </div>
            }
          >
            <div className="relative mb-2">
              <svg
                className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none"
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
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
            <ResizableList defaultHeight={140}>
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
                <QuickAction label="Clear" onClick={() => updateFilter('machineFilters', new Map())} />
              </div>
            }
          >
            <div className="relative mb-2">
              <svg
                className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none"
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
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
            <ResizableList defaultHeight={140}>
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
        onClick={() => onFiltersChange(getDefaultSysmonFilters())}
        className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border border-[#30363d] hover:border-[#3d444d] rounded-md transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
