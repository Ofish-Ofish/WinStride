import type { GraphFilters, FilterState } from './filterTypes';
import { serializeFilters, deserializeFilters, type SerializedGraphFilters } from './filterSerializer';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FilterPreset {
  id: string;
  name: string;
  builtin: boolean;
  filters: GraphFilters;
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

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

export const BUILTIN_PRESETS: FilterPreset[] = [
  {
    id: 'builtin:auth-only',
    name: 'Auth Only',
    builtin: true,
    filters: {
      eventFilters: new Map<number, FilterState>([[4624, 'select'], [4625, 'select'], [4634, 'select']]),
      timeStart: ago(259_200_000), // 3d
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
    filters: {
      eventFilters: new Map(),
      timeStart: ago(604_800_000), // 7d
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
    filters: {
      eventFilters: new Map<number, FilterState>([[4672, 'select'], [4648, 'select']]),
      timeStart: ago(604_800_000), // 7d
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
    filters: {
      eventFilters: new Map<number, FilterState>([
        [4720, 'select'], [4722, 'select'], [4723, 'select'], [4724, 'select'],
        [4725, 'select'], [4726, 'select'], [4738, 'select'], [4740, 'select'], [4767, 'select'],
      ]),
      timeStart: ago(1_209_600_000), // 14d
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
