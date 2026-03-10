/* ------------------------------------------------------------------ */
/*  Re-export shared primitives from centralized location              */
/* ------------------------------------------------------------------ */

export { type FilterState, countVisible, resolveTriState, cycleMap } from '../../../components/filter/filterPrimitives';

/* ------------------------------------------------------------------ */
/*  Security-specific filter types                                     */
/* ------------------------------------------------------------------ */

import type { FilterState } from '../../../components/filter/filterPrimitives';
import type { Severity } from '../../../shared/detection/rules';

export interface GraphFilters {
  eventFilters: Map<number, FilterState>;
  timeStart: string;   // ISO string or '' (unbounded = all time)
  timeEnd: string;     // ISO string or '' (unbounded = now)
  machineFilters: Map<string, FilterState>;
  userFilters: Map<string, FilterState>;
  logonTypeFilters: Map<number, FilterState>;
  ipFilters: Map<string, FilterState>;
  authPackageFilters: Map<string, FilterState>;
  processFilters: Map<string, FilterState>;
  failureStatusFilters: Map<string, FilterState>;
  showElevatedOnly: boolean;
  activityMin: number; // default 1
  activityMax: number; // default Infinity (no upper cap)
  hideMachineAccounts: boolean;
  severityFilter: Set<Severity | 'undetected'>;
}

export function getDefaultFilters(): GraphFilters {
  return {
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
    timeStart: new Date(Date.now() - 259_200_000).toISOString(), // 3d ago
    timeEnd: '',
    machineFilters: new Map(),
    userFilters: new Map(),
    logonTypeFilters: new Map(),
    ipFilters: new Map(),
    authPackageFilters: new Map(),
    processFilters: new Map(),
    failureStatusFilters: new Map(),
    showElevatedOnly: false,
    activityMin: 1,
    activityMax: Infinity,
    hideMachineAccounts: true,
    severityFilter: new Set<Severity | 'undetected'>(['undetected', 'low', 'medium', 'high', 'critical']),
  };
}

export const DEFAULT_FILTERS: GraphFilters = getDefaultFilters();
