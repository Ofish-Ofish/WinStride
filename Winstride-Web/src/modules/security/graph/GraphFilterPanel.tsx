import { useState, useMemo, useCallback } from 'react';
import { EVENT_LABELS, LOGON_TYPE_LABELS, isSystemAccount } from './transformEvents';

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

export interface GraphFilters {
  eventIds: number[];
  timeRange: '1h' | '6h' | '12h' | '24h' | '3d' | '7d' | '14d' | '30d' | 'all';
  excludedMachines: Set<string>;
  excludedUsers: Set<string>;
  logonTypes: number[];
  activityThreshold: number;
  hideMachineAccounts: boolean;
}

export const DEFAULT_FILTERS: GraphFilters = {
  eventIds: [4624, 4625, 4634],
  timeRange: '3d',
  excludedMachines: new Set(),
  excludedUsers: new Set(),
  logonTypes: Object.keys(LOGON_TYPE_LABELS).map(Number),
  activityThreshold: 1,
  hideMachineAccounts: true,
};

const TIME_STEPS: GraphFilters['timeRange'][] = [
  '1h', '6h', '12h', '24h', '3d', '7d', '14d', '30d', 'all',
];

const TIME_DISPLAY: Record<string, string> = {
  '1h': '1h', '6h': '6h', '12h': '12h', '24h': '24h',
  '3d': '3d', '7d': '7d', '14d': '14d', '30d': '30d', 'all': 'All',
};

const EVENT_CATEGORIES: { name: string; ids: number[] }[] = [
  { name: 'Authentication', ids: [4624, 4625, 4634, 4647, 4648] },
  { name: 'Privileges', ids: [4672] },
  { name: 'Account Mgmt', ids: [4720, 4722, 4723, 4724, 4725, 4726, 4738, 4740, 4767] },
  { name: 'Group Changes', ids: [4728, 4732, 4733, 4756] },
  { name: 'Kerberos & NTLM', ids: [4768, 4769, 4776] },
  { name: 'Object Access', ids: [4662, 4798, 4799, 5379] },
];

const ALL_EVENT_IDS = Object.keys(EVENT_LABELS).map(Number);

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
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function SliderTrack({ fill }: { fill: number }) {
  return (
    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-[#21262d] pointer-events-none">
      <div
        className="h-full rounded-full transition-[width] duration-75"
        style={{ width: `${fill}%`, background: 'linear-gradient(90deg, #1f6feb, #58a6ff)' }}
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

function Checkbox({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub?: string;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className="flex items-center gap-2.5 px-2 py-[5px] rounded-md hover:bg-[#1c2128] cursor-pointer group transition-colors select-none"
    >
      <div
        className={`w-[15px] h-[15px] rounded-[3px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all ${
          checked
            ? 'bg-[#58a6ff] border-[#58a6ff]'
            : 'border-[#3d444d] group-hover:border-[#58a6ff]/50'
        }`}
      >
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <span className="text-[13px] text-gray-300 leading-tight">
        {label}
        {sub && <span className="text-gray-500 ml-1.5">— {sub}</span>}
      </span>
    </div>
  );
}

function CategoryCheckbox({
  checked,
  partial,
  onChange,
  label,
}: {
  checked: boolean;
  partial: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className="flex items-center gap-2 mb-1 group"
    >
      <div
        className={`w-[14px] h-[14px] rounded-[3px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all ${
          checked
            ? 'bg-[#58a6ff] border-[#58a6ff]'
            : partial
              ? 'border-[#58a6ff]/60 bg-[#58a6ff]/20'
              : 'border-[#3d444d] group-hover:border-[#58a6ff]/50'
        }`}
      >
        {checked && (
          <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {partial && !checked && <div className="w-1.5 h-[2px] bg-[#58a6ff] rounded-full" />}
      </div>
      <span className="text-[12px] font-medium text-gray-400 group-hover:text-gray-200 transition-colors uppercase tracking-wide">
        {label}
      </span>
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

  /* ---- Time slider ---- */
  const timeIndex = TIME_STEPS.indexOf(filters.timeRange);
  const timeFill = (timeIndex / (TIME_STEPS.length - 1)) * 100;

  /* ---- Activity slider ---- */
  const activityMax = Math.max(maxActivity, 10);
  const activityFill = ((filters.activityThreshold - 1) / Math.max(activityMax - 1, 1)) * 100;

  /* ---- Event helpers ---- */
  const toggleEventId = (id: number, on: boolean) => {
    const next = on ? [...filters.eventIds, id] : filters.eventIds.filter((e) => e !== id);
    updateFilter('eventIds', next);
  };

  const toggleCategory = (ids: number[], on: boolean) => {
    if (on) {
      updateFilter('eventIds', Array.from(new Set([...filters.eventIds, ...ids])));
    } else {
      updateFilter(
        'eventIds',
        filters.eventIds.filter((e) => !ids.includes(e)),
      );
    }
  };

  const isCategoryChecked = (ids: number[]) => ids.every((id) => filters.eventIds.includes(id));
  const isCategoryPartial = (ids: number[]) =>
    ids.some((id) => filters.eventIds.includes(id)) && !isCategoryChecked(ids);

  /* ---- Logon type helpers ---- */
  const toggleLogonType = (lt: number, on: boolean) => {
    const next = on ? [...filters.logonTypes, lt] : filters.logonTypes.filter((t) => t !== lt);
    updateFilter('logonTypes', next);
  };

  /* ---- Machine helpers ---- */
  const toggleMachine = (machine: string, included: boolean) => {
    const next = new Set(filters.excludedMachines);
    included ? next.delete(machine) : next.add(machine);
    updateFilter('excludedMachines', next);
  };

  const filteredMachines = useMemo(
    () => availableMachines.filter((m) => m.toLowerCase().includes(machineSearch.toLowerCase())),
    [availableMachines, machineSearch],
  );

  const includedMachineCount = availableMachines.filter(
    (m) => !filters.excludedMachines.has(m),
  ).length;

  /* ---- User helpers ---- */
  const toggleUser = (user: string, included: boolean) => {
    const next = new Set(filters.excludedUsers);
    included ? next.delete(user) : next.add(user);
    updateFilter('excludedUsers', next);
  };

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

  const includedUserCount = visibleUsers.filter(
    (u) => !filters.excludedUsers.has(u),
  ).length;

  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-4 space-y-3">
      {/* Time Range */}
      <CollapsibleSection
        title="Time Range"
        right={
          <span className="text-[12px] font-medium text-[#58a6ff]">
            {TIME_DISPLAY[filters.timeRange]}
          </span>
        }
      >
        <div className="relative h-5">
          <SliderTrack fill={timeFill} />
          <input
            type="range"
            className="gf-slider"
            min={0}
            max={TIME_STEPS.length - 1}
            step={1}
            value={timeIndex}
            onChange={(e) => updateFilter('timeRange', TIME_STEPS[Number(e.target.value)])}
          />
        </div>
        <div className="flex justify-between mt-1 px-0.5">
          {TIME_STEPS.map((step, i) => (
            <span
              key={step}
              className={`text-[9px] cursor-pointer select-none transition-colors ${
                i === timeIndex
                  ? 'text-[#58a6ff] font-semibold'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
              onClick={(e) => { e.stopPropagation(); updateFilter('timeRange', step); }}
            >
              {TIME_DISPLAY[step]}
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
            &ge; {filters.activityThreshold}
          </span>
        }
      >
        <div className="relative h-5">
          <SliderTrack fill={activityFill} />
          <input
            type="range"
            className="gf-slider"
            min={1}
            max={activityMax}
            step={1}
            value={filters.activityThreshold}
            onChange={(e) => updateFilter('activityThreshold', Number(e.target.value))}
          />
        </div>
        <div className="flex justify-between mt-1 px-0.5">
          <span className="text-[9px] text-gray-600 select-none">1</span>
          <span className="text-[9px] text-gray-600 select-none">{activityMax}</span>
        </div>
      </CollapsibleSection>

      <div className="h-px bg-[#21262d]" />

      {/* Event Types */}
      <CollapsibleSection
        title="Events"
        right={
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-gray-600">
              {filters.eventIds.length}/{ALL_EVENT_IDS.length}
            </span>
            <QuickAction label="All" onClick={() => updateFilter('eventIds', ALL_EVENT_IDS)} />
            <QuickAction label="None" onClick={() => updateFilter('eventIds', [])} />
            <QuickAction
              label="Auth"
              onClick={() => updateFilter('eventIds', [4624, 4625, 4634])}
            />
          </div>
        }
      >
        <ResizableList defaultHeight={240}>
          <div className="space-y-2">
            {EVENT_CATEGORIES.map((cat) => {
              const allChecked = isCategoryChecked(cat.ids);
              const partial = isCategoryPartial(cat.ids);
              return (
                <div key={cat.name}>
                  <CategoryCheckbox
                    checked={allChecked}
                    partial={partial}
                    onChange={(on) => toggleCategory(cat.ids, on)}
                    label={cat.name}
                  />
                  <div className="ml-0.5">
                    {cat.ids.map((id) => (
                      <Checkbox
                        key={id}
                        checked={filters.eventIds.includes(id)}
                        onChange={(v) => toggleEventId(id, v)}
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
              {filters.logonTypes.length}/{Object.keys(LOGON_TYPE_LABELS).length}
            </span>
            <QuickAction
              label="All"
              onClick={() =>
                updateFilter('logonTypes', Object.keys(LOGON_TYPE_LABELS).map(Number))
              }
            />
            <QuickAction label="None" onClick={() => updateFilter('logonTypes', [])} />
          </div>
        }
      >
        <ResizableList defaultHeight={200}>
          <div className="space-y-0.5">
            {Object.entries(LOGON_TYPE_LABELS).map(([ltStr, label]) => {
              const lt = Number(ltStr);
              return (
                <Checkbox
                  key={lt}
                  checked={filters.logonTypes.includes(lt)}
                  onChange={(v) => toggleLogonType(lt, v)}
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
                  {includedUserCount}/{visibleUsers.length}
                </span>
                <QuickAction
                  label="All"
                  onClick={() => updateFilter('excludedUsers', new Set())}
                />
                <QuickAction
                  label="None"
                  onClick={() => updateFilter('excludedUsers', new Set(availableUsers))}
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
                  <Checkbox
                    key={user}
                    checked={!filters.excludedUsers.has(user)}
                    onChange={(v) => toggleUser(user, v)}
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
                  {includedMachineCount}/{availableMachines.length}
                </span>
                <QuickAction
                  label="All"
                  onClick={() => updateFilter('excludedMachines', new Set())}
                />
                <QuickAction
                  label="None"
                  onClick={() => updateFilter('excludedMachines', new Set(availableMachines))}
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
                  <Checkbox
                    key={machine}
                    checked={!filters.excludedMachines.has(machine)}
                    onChange={(v) => toggleMachine(machine, v)}
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
        onClick={() => onFiltersChange({ ...DEFAULT_FILTERS, excludedMachines: new Set(), excludedUsers: new Set() })}
        className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border border-[#30363d] hover:border-[#3d444d] rounded-md transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
