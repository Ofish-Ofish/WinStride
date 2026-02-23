import type { WinEvent } from '../../modules/security/shared/types';
import { getDataArray, getDataField } from '../eventParsing';
import { getBundledSigmaRules } from './sigma/bundledRules';

/* ------------------------------------------------------------------ */
/*  Types (unchanged — all consumers import these)                     */
/* ------------------------------------------------------------------ */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type Module = 'sysmon' | 'powershell' | 'security';

export interface DetectionRule {
  id: string;
  name: string;
  severity: Severity;
  module: Module;
  mitre?: string;
  description: string;
  /** Return true if a single event matches this rule. */
  match: (event: WinEvent) => boolean;
}

/**
 * Multi-event rules inspect the entire event array (e.g. brute force).
 * They return event IDs that triggered the detection.
 */
export interface MultiEventRule {
  id: string;
  name: string;
  severity: Severity;
  module: Module;
  mitre?: string;
  description: string;
  /** Return a Set of event.id values that should be flagged. */
  matchAll: (events: WinEvent[]) => Set<number>;
}

export interface Detection {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  mitre?: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers (kept for multi-event rule)                                */
/* ------------------------------------------------------------------ */

function lower(event: WinEvent, name: string): string {
  const arr = getDataArray(event);
  if (!arr) return '';
  return getDataField(arr, name).toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Multi-event rules (Sigma can't express these)                      */
/* ------------------------------------------------------------------ */

const BRUTE_FORCE_THRESHOLD = 5;
const BRUTE_FORCE_WINDOW_MS = 5 * 60 * 1000;

export const multiEventRules: MultiEventRule[] = [
  {
    id: 'SEC-M01',
    name: 'Brute force detected',
    severity: 'critical',
    module: 'security',
    mitre: 'T1110',
    description: `${BRUTE_FORCE_THRESHOLD}+ failed logons for the same account within 5 minutes`,
    matchAll: (events) => {
      const flagged = new Set<number>();
      const byUser = new Map<string, WinEvent[]>();
      for (const e of events) {
        if (e.eventId !== 4625) continue;
        const user = lower(e, 'TargetUserName');
        if (!user) continue;
        let arr = byUser.get(user);
        if (!arr) {
          arr = [];
          byUser.set(user, arr);
        }
        arr.push(e);
      }
      for (const userEvents of byUser.values()) {
        if (userEvents.length < BRUTE_FORCE_THRESHOLD) continue;
        const sorted = userEvents.sort(
          (a, b) => new Date(a.timeCreated).getTime() - new Date(b.timeCreated).getTime(),
        );
        for (let i = 0; i <= sorted.length - BRUTE_FORCE_THRESHOLD; i++) {
          const windowEnd = new Date(sorted[i].timeCreated).getTime() + BRUTE_FORCE_WINDOW_MS;
          let count = 0;
          for (
            let j = i;
            j < sorted.length && new Date(sorted[j].timeCreated).getTime() <= windowEnd;
            j++
          ) {
            count++;
          }
          if (count >= BRUTE_FORCE_THRESHOLD) {
            const start = new Date(sorted[i].timeCreated).getTime();
            for (const ev of sorted) {
              const t = new Date(ev.timeCreated).getTime();
              if (t >= start && t <= windowEnd) flagged.add(ev.id);
            }
            break;
          }
        }
      }
      return flagged;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  All rules — Sigma-compiled, pre-indexed by module                  */
/* ------------------------------------------------------------------ */

let _byModule: Map<Module, DetectionRule[]> | null = null;

function ensureRules(): Map<Module, DetectionRule[]> {
  if (_byModule) return _byModule;

  const t0 = performance.now();
  const all = getBundledSigmaRules();
  const map = new Map<Module, DetectionRule[]>();
  map.set('sysmon', []);
  map.set('powershell', []);
  map.set('security', []);
  for (const rule of all) {
    map.get(rule.module)!.push(rule);
  }
  console.log(
    `[Sigma] Compiled ${all.length} rules (sysmon: ${map.get('sysmon')!.length}, powershell: ${map.get('powershell')!.length}, security: ${map.get('security')!.length}) in ${(performance.now() - t0).toFixed(0)}ms`,
  );
  _byModule = map;
  return map;
}

export function getRulesForModule(module: Module): DetectionRule[] {
  return ensureRules().get(module) ?? [];
}

export function getMultiEventRulesForModule(module: Module): MultiEventRule[] {
  return multiEventRules.filter((r) => r.module === module);
}
