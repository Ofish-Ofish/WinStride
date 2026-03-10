import type { Preset } from '../../../components/filter';
import type { SysmonFilters, FilterState } from './filterTypes';
import { getDefaultSysmonFilters } from './filterTypes';

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const THREE_DAYS = 259_200_000;

function preset(overrides: Partial<SysmonFilters>): SysmonFilters {
  return { ...getDefaultSysmonFilters(), ...overrides };
}

export const SYSMON_PRESETS: Preset<SysmonFilters>[] = [
  {
    id: 'builtin:all-activity',
    name: 'All Activity',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([[1, 'select'], [3, 'select'], [11, 'select']]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:processes-only',
    name: 'Processes',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([[1, 'select']]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:network-only',
    name: 'Network',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([[3, 'select']]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:file-only',
    name: 'File Creates',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([[11, 'select']]),
      timeStart: ago(THREE_DAYS),
    }),
  },
];

/* ---- Serialization helpers for generic PresetBar ---- */

export function serializeSysmonFilters(f: SysmonFilters): unknown {
  return {
    eventFilters: [...f.eventFilters.entries()],
    timeStart: f.timeStart,
    timeEnd: f.timeEnd,
    machineFilters: [...f.machineFilters.entries()],
    processFilters: [...f.processFilters.entries()],
    integrityFilters: [...f.integrityFilters.entries()],
    userFilters: [...f.userFilters.entries()],
    severityFilter: [...f.severityFilter],
  };
}

export function deserializeSysmonFilters(s: unknown): SysmonFilters {
  const o = s as Record<string, unknown>;
  return {
    eventFilters: new Map(o.eventFilters as [number, FilterState][]),
    timeStart: o.timeStart as string,
    timeEnd: o.timeEnd as string,
    machineFilters: new Map((o.machineFilters as [string, FilterState][]) ?? []),
    processFilters: new Map((o.processFilters as [string, FilterState][]) ?? []),
    integrityFilters: new Map((o.integrityFilters as [string, FilterState][]) ?? []),
    userFilters: new Map((o.userFilters as [string, FilterState][]) ?? []),
    severityFilter: new Set((o.severityFilter as string[]) ?? ['undetected', 'low', 'medium', 'high', 'critical']) as SysmonFilters['severityFilter'],
  };
}

export function cloneSysmonFilters(f: SysmonFilters): SysmonFilters {
  return {
    ...f,
    eventFilters: new Map(f.eventFilters),
    machineFilters: new Map(f.machineFilters),
    processFilters: new Map(f.processFilters),
    integrityFilters: new Map(f.integrityFilters),
    userFilters: new Map(f.userFilters),
    severityFilter: new Set(f.severityFilter),
  };
}
