import type { WinEvent } from '../../modules/security/shared/types';
import { getBundledSigmaRules, getBundledCorrelationRules } from './sigma/bundledRules';

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
  /** Event IDs this rule applies to (undefined = all events in the module) */
  eventIds?: number[];
  /** Original Sigma rule UUID (for correlation reference resolution) */
  sigmaId?: string;
  /** Original Sigma rule `name` field (for correlation reference resolution) */
  sigmaName?: string;
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
/*  Multi-event rules (hardcoded fallbacks + correlation rules)        */
/* ------------------------------------------------------------------ */

export const multiEventRules: MultiEventRule[] = [];

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

let _allMultiEventRules: MultiEventRule[] | null = null;

function getAllMultiEventRules(): MultiEventRule[] {
  if (_allMultiEventRules) return _allMultiEventRules;
  const correlations = getBundledCorrelationRules();
  _allMultiEventRules = [...multiEventRules, ...correlations];
  return _allMultiEventRules;
}

export function getMultiEventRulesForModule(module: Module): MultiEventRule[] {
  return getAllMultiEventRules().filter((r) => r.module === module);
}
