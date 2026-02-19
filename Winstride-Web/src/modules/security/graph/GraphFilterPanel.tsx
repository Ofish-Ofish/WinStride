import { useState, useRef, useEffect } from 'react';
import { EVENT_LABELS, LOGON_TYPE_LABELS } from './transformEvents';

export interface GraphFilters {
  eventIds: number[];
  timeRange: '1h' | '6h' | '24h' | '3d' | '7d' | '30d' | 'all';
  excludedMachines: Set<string>;
  logonTypes: number[];
  minActivity: number;
}

export const DEFAULT_FILTERS: GraphFilters = {
  eventIds: [4624, 4625, 4634],
  timeRange: '3d',
  excludedMachines: new Set(),
  logonTypes: Object.keys(LOGON_TYPE_LABELS).map(Number),
  minActivity: 1,
};

interface Props {
  filters: GraphFilters;
  onFiltersChange: (filters: GraphFilters) => void;
  availableMachines: string[];
}

const TIME_RANGE_OPTIONS: { value: GraphFilters['timeRange']; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '3d', label: '3d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

function Dropdown({ label, children, badge }: { label: string; children: React.ReactNode; badge?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border transition-all duration-150 ${
          open
            ? 'text-gray-200 bg-[#1c2128] border-[#58a6ff]'
            : 'text-gray-400 hover:text-gray-200 bg-[#161b22] hover:bg-[#1c2128] border-[#30363d]'
        }`}
      >
        {label}
        {badge && (
          <span className="px-1.5 py-0.5 text-[10px] bg-[#58a6ff]/15 text-[#58a6ff] rounded-full leading-none">
            {badge}
          </span>
        )}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl shadow-black/40 p-2">
          {children}
        </div>
      )}
    </div>
  );
}

function CheckboxItem({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#1c2128] cursor-pointer text-[11px] text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-[#30363d] bg-[#0d1117] accent-[#58a6ff]"
      />
      {label}
    </label>
  );
}

export default function GraphFilterPanel({ filters, onFiltersChange, availableMachines }: Props) {
  const [machineSearch, setMachineSearch] = useState('');

  const updateFilter = <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleEventId = (id: number, checked: boolean) => {
    const next = checked ? [...filters.eventIds, id] : filters.eventIds.filter((e) => e !== id);
    updateFilter('eventIds', next);
  };

  const toggleLogonType = (lt: number, checked: boolean) => {
    const next = checked ? [...filters.logonTypes, lt] : filters.logonTypes.filter((t) => t !== lt);
    updateFilter('logonTypes', next);
  };

  const toggleMachine = (machine: string, included: boolean) => {
    const next = new Set(filters.excludedMachines);
    if (included) {
      next.delete(machine);
    } else {
      next.add(machine);
    }
    updateFilter('excludedMachines', next);
  };

  const filteredMachines = availableMachines.filter((m) =>
    m.toLowerCase().includes(machineSearch.toLowerCase()),
  );

  const selectedMachineCount = availableMachines.filter((m) => !filters.excludedMachines.has(m)).length;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg flex-wrap">
      {/* Event Types */}
      <Dropdown label="Events" badge={`${filters.eventIds.length}`}>
        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {Object.entries(EVENT_LABELS).map(([idStr, label]) => {
            const id = Number(idStr);
            return (
              <CheckboxItem
                key={id}
                checked={filters.eventIds.includes(id)}
                onChange={(v) => toggleEventId(id, v)}
                label={`${id} - ${label}`}
              />
            );
          })}
        </div>
      </Dropdown>

      {/* Time Range */}
      <Dropdown label="Time" badge={filters.timeRange}>
        <div className="flex flex-wrap gap-1 p-1">
          {TIME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateFilter('timeRange', opt.value)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-all ${
                filters.timeRange === opt.value
                  ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/40'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#1c2128] border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Dropdown>

      {/* Machines */}
      <Dropdown label="Machines" badge={`${selectedMachineCount}/${availableMachines.length}`}>
        <div className="space-y-2">
          <input
            type="text"
            value={machineSearch}
            onChange={(e) => setMachineSearch(e.target.value)}
            placeholder="Search machines..."
            className="w-full px-2 py-1 text-[11px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]"
          />
          <div className="flex gap-2 px-1">
            <button
              onClick={() => updateFilter('excludedMachines', new Set())}
              className="text-[10px] text-[#58a6ff] hover:underline"
            >
              Select All
            </button>
            <button
              onClick={() => updateFilter('excludedMachines', new Set(availableMachines))}
              className="text-[10px] text-[#58a6ff] hover:underline"
            >
              Deselect All
            </button>
          </div>
          <div className="max-h-[180px] overflow-y-auto space-y-0.5">
            {filteredMachines.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-gray-600">No machines found</div>
            )}
            {filteredMachines.map((machine) => (
              <CheckboxItem
                key={machine}
                checked={!filters.excludedMachines.has(machine)}
                onChange={(included) => toggleMachine(machine, included)}
                label={machine}
              />
            ))}
          </div>
        </div>
      </Dropdown>

      {/* Logon Types */}
      <Dropdown label="Logon Types" badge={`${filters.logonTypes.length}`}>
        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {Object.entries(LOGON_TYPE_LABELS).map(([ltStr, label]) => {
            const lt = Number(ltStr);
            return (
              <CheckboxItem
                key={lt}
                checked={filters.logonTypes.includes(lt)}
                onChange={(v) => toggleLogonType(lt, v)}
                label={`${lt} - ${label}`}
              />
            );
          })}
        </div>
      </Dropdown>

      {/* Min Activity */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-gray-500">Min Activity</span>
        <input
          type="number"
          min={1}
          value={filters.minActivity}
          onChange={(e) => updateFilter('minActivity', Math.max(1, parseInt(e.target.value) || 1))}
          className="w-14 px-2 py-1 text-[11px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 outline-none focus:border-[#58a6ff] text-center"
        />
      </div>
    </div>
  );
}
