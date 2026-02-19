import type { GraphFilters, FilterState } from './GraphFilterPanel';
import { serializeFilters, deserializeFilters, type SerializedGraphFilters } from './filterSerializer';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FilterPreset {
  id: string;
  name: string;
  builtin: boolean;
  filters: GraphFilters;
  /** For built-in presets: ms offset from now to compute timeStart at apply time */
  timeOffset?: number;
}

/** Apply a preset, recomputing timeStart from timeOffset if present */
export function applyPreset(preset: FilterPreset): GraphFilters {
  const f = {
    ...preset.filters,
    eventFilters: new Map(preset.filters.eventFilters),
    machineFilters: new Map(preset.filters.machineFilters),
    userFilters: new Map(preset.filters.userFilters),
    logonTypeFilters: new Map(preset.filters.logonTypeFilters),
  };
  if (preset.timeOffset !== undefined) {
    f.timeStart = new Date(Date.now() - preset.timeOffset).toISOString();
  }
  return f;
}

interface StoredCustomPreset {
  id: string;
  name: string;
  builtin: false;
  filters: SerializedGraphFilters;
}

/* ------------------------------------------------------------------ */
/*  Built-in Presets                                                    */
/* ------------------------------------------------------------------ */

export const BUILTIN_PRESETS: FilterPreset[] = [
  {
    id: 'builtin:auth-only',
    name: 'Auth Only',
    builtin: true,
    timeOffset: 259_200_000, // 3d
    filters: {
      eventFilters: new Map<number, FilterState>([[4624, 'select'], [4625, 'select'], [4634, 'select']]),
      timeStart: new Date(Date.now() - 259_200_000).toISOString(),
      timeEnd: '',
      machineFilters: new Map(),
      userFilters: new Map(),
      logonTypeFilters: new Map(),
      activityMin: 1,
      activityMax: Infinity,
      hideMachineAccounts: true,
    },
  },
  {
    id: 'builtin:all-events',
    name: 'All Events',
    builtin: true,
    timeOffset: 604_800_000, // 7d
    filters: {
      eventFilters: new Map(),
      timeStart: new Date(Date.now() - 604_800_000).toISOString(),
      timeEnd: '',
      machineFilters: new Map(),
      userFilters: new Map(),
      logonTypeFilters: new Map(),
      activityMin: 1,
      activityMax: Infinity,
      hideMachineAccounts: false,
    },
  },
  {
    id: 'builtin:privileges',
    name: 'Privileges',
    builtin: true,
    timeOffset: 604_800_000, // 7d
    filters: {
      eventFilters: new Map<number, FilterState>([[4672, 'select'], [4648, 'select']]),
      timeStart: new Date(Date.now() - 604_800_000).toISOString(),
      timeEnd: '',
      machineFilters: new Map(),
      userFilters: new Map(),
      logonTypeFilters: new Map(),
      activityMin: 1,
      activityMax: Infinity,
      hideMachineAccounts: true,
    },
  },
  {
    id: 'builtin:account-mgmt',
    name: 'Acct Mgmt',
    builtin: true,
    timeOffset: 1_209_600_000, // 14d
    filters: {
      eventFilters: new Map<number, FilterState>([
        [4720, 'select'], [4722, 'select'], [4723, 'select'], [4724, 'select'],
        [4725, 'select'], [4726, 'select'], [4738, 'select'], [4740, 'select'], [4767, 'select'],
      ]),
      timeStart: new Date(Date.now() - 1_209_600_000).toISOString(),
      timeEnd: '',
      machineFilters: new Map(),
      userFilters: new Map(),
      logonTypeFilters: new Map(),
      activityMin: 1,
      activityMax: Infinity,
      hideMachineAccounts: true,
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Custom Preset CRUD (localStorage)                                  */
/* ------------------------------------------------------------------ */

const PRESETS_KEY = 'winstride:graphFilterPresets';

export function loadCustomPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const arr: StoredCustomPreset[] = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((p) => ({
      id: p.id,
      name: p.name,
      builtin: false as const,
      filters: deserializeFilters(p.filters),
    }));
  } catch {
    return [];
  }
}

function saveCustomPresetsRaw(presets: StoredCustomPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch { /* quota */ }
}

function loadCustomPresetsRaw(): StoredCustomPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(name: string, filters: GraphFilters): FilterPreset {
  const existing = loadCustomPresetsRaw();
  const preset: StoredCustomPreset = {
    id: `custom:${Date.now()}`,
    name,
    builtin: false,
    filters: serializeFilters(filters),
  };
  existing.push(preset);
  saveCustomPresetsRaw(existing);
  return { id: preset.id, name, builtin: false, filters };
}

export function deleteCustomPreset(id: string): void {
  const existing = loadCustomPresetsRaw();
  saveCustomPresetsRaw(existing.filter((p) => p.id !== id));
}
