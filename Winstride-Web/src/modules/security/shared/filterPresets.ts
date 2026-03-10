import type { Preset } from '../../../components/filter';
import type { GraphFilters, FilterState } from './filterTypes';
import { getDefaultFilters } from './filterTypes';

/* ------------------------------------------------------------------ */
/*  Built-in Presets                                                    */
/* ------------------------------------------------------------------ */

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/** Build a preset filter set — fills in new fields from defaults automatically */
function preset(overrides: Partial<GraphFilters>): GraphFilters {
  return { ...getDefaultFilters(), ...overrides };
}

const THREE_DAYS = 259_200_000;

export const BUILTIN_PRESETS: Preset<GraphFilters>[] = [
  {
    id: 'builtin:ccdc-overview',
    name: 'CCDC Overview',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([
        // Auth (no logoff noise)
        [4624, 'select'], [4625, 'select'], [4648, 'select'],
        // Privileges
        [4672, 'select'],
        // Account management
        [4720, 'select'], [4722, 'select'], [4723, 'select'], [4724, 'select'],
        [4725, 'select'], [4726, 'select'], [4738, 'select'], [4740, 'select'], [4767, 'select'],
        // Group changes
        [4728, 'select'], [4732, 'select'], [4733, 'select'], [4756, 'select'],
        // Kerberos & NTLM
        [4768, 'select'], [4769, 'select'], [4776, 'select'],
      ]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:threats-only',
    name: 'Threats Only',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([
        [4625, 'select'], [4648, 'select'], [4672, 'select'],
        // Account & group changes (persistence / escalation)
        [4720, 'select'], [4722, 'select'], [4723, 'select'], [4724, 'select'],
        [4725, 'select'], [4726, 'select'], [4738, 'select'], [4740, 'select'], [4767, 'select'],
        [4728, 'select'], [4732, 'select'], [4733, 'select'], [4756, 'select'],
      ]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:account-changes',
    name: 'Acct & Groups',
    builtin: true,
    filters: preset({
      eventFilters: new Map<number, FilterState>([
        [4720, 'select'], [4722, 'select'], [4723, 'select'], [4724, 'select'],
        [4725, 'select'], [4726, 'select'], [4738, 'select'], [4740, 'select'], [4767, 'select'],
        [4728, 'select'], [4732, 'select'], [4733, 'select'], [4756, 'select'],
      ]),
      timeStart: ago(THREE_DAYS),
    }),
  },
  {
    id: 'builtin:all-events',
    name: 'All Events',
    builtin: true,
    filters: preset({
      eventFilters: new Map(),
      timeStart: ago(THREE_DAYS),
    }),
  },
];
