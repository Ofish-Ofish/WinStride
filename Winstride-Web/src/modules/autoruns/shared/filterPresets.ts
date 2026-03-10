import type { Preset } from '../../../components/filter';
import type { AutorunsFilters } from './filterTypes';
import { getDefaultAutorunsFilters } from './filterTypes';

function preset(overrides: Partial<AutorunsFilters>): AutorunsFilters {
  return { ...getDefaultAutorunsFilters(), ...overrides };
}

export const AUTORUNS_PRESETS: Preset<AutorunsFilters>[] = [
  {
    id: 'builtin:all-autoruns',
    name: 'All',
    builtin: true,
    filters: preset({}),
  },
  {
    id: 'builtin:not-verified',
    name: 'Not Verified',
    builtin: true,
    filters: preset({
      verifiedFilter: 'not-verified-only',
    }),
  },
  {
    id: 'builtin:verified-only',
    name: 'Verified Only',
    builtin: true,
    filters: preset({
      verifiedFilter: 'verified-only',
    }),
  },
];

/* ---- Serialization helpers for generic PresetBar ---- */

export function serializeAutorunsFilters(f: AutorunsFilters): unknown {
  return {
    machineFilters: [...f.machineFilters.entries()],
    categoryFilters: [...f.categoryFilters.entries()],
    verifiedFilter: f.verifiedFilter,
  };
}

export function deserializeAutorunsFilters(s: unknown): AutorunsFilters {
  const o = s as Record<string, unknown>;
  return {
    machineFilters: new Map((o.machineFilters as [string, import('./filterTypes').FilterState][]) ?? []),
    categoryFilters: new Map((o.categoryFilters as [string, import('./filterTypes').FilterState][]) ?? []),
    verifiedFilter: (o.verifiedFilter as AutorunsFilters['verifiedFilter']) ?? 'all',
  };
}

export function cloneAutorunsFilters(f: AutorunsFilters): AutorunsFilters {
  return {
    machineFilters: new Map(f.machineFilters),
    categoryFilters: new Map(f.categoryFilters),
    verifiedFilter: f.verifiedFilter,
  };
}
