import type { Preset } from '../../../components/filter';
import type { PSFilters, FilterState } from './filterTypes';
import { getDefaultPSFilters } from './filterTypes';

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const THREE_DAYS = 259_200_000;

function preset(overrides: Partial<PSFilters>): PSFilters {
  return { ...getDefaultPSFilters(), ...overrides };
}

export const PS_PRESETS: Preset<PSFilters>[] = [
  {
    id: 'builtin:all-ps',
    name: 'All Events',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([[4103, 'select'], [4104, 'select']]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:scripts-only',
    name: 'Script Blocks',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([[4104, 'select']]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:commands-only',
    name: 'Commands',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([[4103, 'select']]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:suspicious-only',
    name: 'Suspicious Only',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([[4103, 'select'], [4104, 'select']]),
      levelFilter: 'warning-only',
      timeStart: ago(THREE_DAYS),
    }),
  },
];

/* ---- Serialization helpers for generic PresetBar ---- */

export function serializePSFilters(f: PSFilters): unknown {
  return {
    eventFilters: [...f.eventFilters.entries()],
    timeStart: f.timeStart,
    timeEnd: f.timeEnd,
    machineFilters: [...f.machineFilters.entries()],
    levelFilter: f.levelFilter,
    severityFilter: [...f.severityFilter],
  };
}

export function deserializePSFilters(s: unknown): PSFilters {
  const o = s as Record<string, unknown>;
  return {
    eventFilters: new Map(o.eventFilters as [number, FilterState][]),
    timeStart: o.timeStart as string,
    timeEnd: o.timeEnd as string,
    machineFilters: new Map((o.machineFilters as [string, FilterState][]) ?? []),
    levelFilter: (o.levelFilter as 'all' | 'warning-only') ?? 'all',
    severityFilter: new Set((o.severityFilter as string[]) ?? ['undetected', 'low', 'medium', 'high', 'critical']) as PSFilters['severityFilter'],
  };
}

export function clonePSFilters(f: PSFilters): PSFilters {
  return {
    ...f,
    eventFilters: new Map(f.eventFilters),
    machineFilters: new Map(f.machineFilters),
    severityFilter: new Set(f.severityFilter),
  };
}
