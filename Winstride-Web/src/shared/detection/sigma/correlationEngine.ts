import type { WinEvent } from '../../../modules/security/shared/types';
import type { MultiEventRule, DetectionRule, Severity, Module } from '../rules';
import { getField } from './fieldMatcher';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ConditionOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export interface CorrelationCondition {
  /** Only for value_count — which field to count distinct values of */
  field?: string;
  /** Threshold operator → value pairs */
  [op: string]: string | number | undefined;
}

export interface CorrelationConfig {
  id: string;
  title: string;
  severity: Severity;
  module: Module;
  mitre?: string;
  description: string;
  /** Base rules whose matches feed the correlation */
  baseRules: DetectionRule[];
  /** Fields to group matched events by */
  groupBy: string[];
  /** Sliding window size in milliseconds */
  timespanMs: number;
  /** Threshold condition */
  condition: CorrelationCondition;
  /** Alias map: virtualField → Map<ruleId, actualField> */
  aliases?: Map<string, Map<string, string>>;
}

/* ------------------------------------------------------------------ */
/*  Timespan parsing                                                   */
/* ------------------------------------------------------------------ */

const MULTIPLIERS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseTimespan(ts: string): number {
  const match = ts.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid timespan: ${ts}`);
  return parseInt(match[1], 10) * MULTIPLIERS[match[2]];
}

/* ------------------------------------------------------------------ */
/*  Condition evaluation                                               */
/* ------------------------------------------------------------------ */

function meetsCondition(value: number, cond: CorrelationCondition): boolean {
  for (const [op, threshold] of Object.entries(cond)) {
    if (op === 'field') continue;
    const t = Number(threshold);
    if (isNaN(t)) continue;
    switch (op as ConditionOp) {
      case 'gt':  if (!(value > t)) return false; break;
      case 'gte': if (!(value >= t)) return false; break;
      case 'lt':  if (!(value < t)) return false; break;
      case 'lte': if (!(value <= t)) return false; break;
      case 'eq':  if (!(value === t)) return false; break;
      case 'neq': if (!(value !== t)) return false; break;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Extract group-by key from an event, respecting aliases */
function getGroupKey(
  event: WinEvent,
  groupBy: string[],
  aliases: Map<string, Map<string, string>> | undefined,
  ruleId?: string,
): string {
  return groupBy
    .map((field) => {
      // Check aliases: if this groupBy field is a virtual alias, resolve it
      if (aliases && ruleId) {
        const aliasMap = aliases.get(field);
        if (aliasMap) {
          const actualField = aliasMap.get(ruleId);
          if (actualField) return getField(event, actualField).toLowerCase();
        }
      }
      return getField(event, field).toLowerCase();
    })
    .join('|');
}

/** Run all base rules against events, return matched event indices with their rule id */
function collectBaseMatches(
  events: WinEvent[],
  baseRules: DetectionRule[],
): Map<number, string> {
  // eventIndex → ruleId that matched it (first match wins)
  const matched = new Map<number, string>();
  for (let i = 0; i < events.length; i++) {
    for (const rule of baseRules) {
      if (rule.eventIds && !rule.eventIds.includes(events[i].eventId)) continue;
      if (rule.match(events[i])) {
        matched.set(i, rule.id);
        break;
      }
    }
  }
  return matched;
}

/** Run all base rules, return per-rule matched indices */
function collectPerRuleMatches(
  events: WinEvent[],
  baseRules: DetectionRule[],
): Map<string, number[]> {
  const byRule = new Map<string, number[]>();
  for (const rule of baseRules) byRule.set(rule.id, []);
  for (let i = 0; i < events.length; i++) {
    for (const rule of baseRules) {
      if (rule.eventIds && !rule.eventIds.includes(events[i].eventId)) continue;
      if (rule.match(events[i])) {
        byRule.get(rule.id)!.push(i);
      }
    }
  }
  return byRule;
}

const _eventTimeCache = new WeakMap<WinEvent, number>();

function eventTime(e: WinEvent): number {
  const cached = _eventTimeCache.get(e);
  if (cached !== undefined) return cached;
  const t = new Date(e.timeCreated).getTime();
  _eventTimeCache.set(e, t);
  return t;
}

/* ------------------------------------------------------------------ */
/*  event_count                                                        */
/* ------------------------------------------------------------------ */

export function buildEventCountRule(config: CorrelationConfig): MultiEventRule {
  return {
    id: config.id,
    name: config.title,
    severity: config.severity,
    module: config.module,
    mitre: config.mitre,
    description: config.description,
    matchAll(events: WinEvent[]): Set<number> {
      const flagged = new Set<number>();
      const matched = collectBaseMatches(events, config.baseRules);

      // Bucket by group key
      const buckets = new Map<string, number[]>();
      for (const [idx, ruleId] of matched) {
        const key = getGroupKey(events[idx], config.groupBy, config.aliases, ruleId);
        if (!key) continue;
        let arr = buckets.get(key);
        if (!arr) { arr = []; buckets.set(key, arr); }
        arr.push(idx);
      }

      // Per bucket: sliding window
      for (const indices of buckets.values()) {
        indices.sort((a, b) => eventTime(events[a]) - eventTime(events[b]));
        const ts = indices.map((i) => eventTime(events[i]));
        let windowStart = 0;
        for (let i = 0; i < indices.length; i++) {
          while (ts[i] - ts[windowStart] > config.timespanMs) windowStart++;
          const count = i - windowStart + 1;
          if (meetsCondition(count, config.condition)) {
            for (let k = windowStart; k <= i; k++) flagged.add(events[indices[k]].id);
          }
        }
      }
      return flagged;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  value_count                                                        */
/* ------------------------------------------------------------------ */

export function buildValueCountRule(config: CorrelationConfig): MultiEventRule {
  const countField = config.condition.field;
  if (!countField) throw new Error(`value_count requires condition.field`);

  return {
    id: config.id,
    name: config.title,
    severity: config.severity,
    module: config.module,
    mitre: config.mitre,
    description: config.description,
    matchAll(events: WinEvent[]): Set<number> {
      const flagged = new Set<number>();
      const matched = collectBaseMatches(events, config.baseRules);

      const buckets = new Map<string, number[]>();
      for (const [idx, ruleId] of matched) {
        const key = getGroupKey(events[idx], config.groupBy, config.aliases, ruleId);
        if (!key) continue;
        let arr = buckets.get(key);
        if (!arr) { arr = []; buckets.set(key, arr); }
        arr.push(idx);
      }

      for (const indices of buckets.values()) {
        indices.sort((a, b) => eventTime(events[a]) - eventTime(events[b]));
        const ts = indices.map((i) => eventTime(events[i]));
        let windowStart = 0;
        for (let i = 0; i < indices.length; i++) {
          while (ts[i] - ts[windowStart] > config.timespanMs) windowStart++;
          // Count distinct values of the target field within window
          const distinctValues = new Set<string>();
          for (let k = windowStart; k <= i; k++) {
            const val = getField(events[indices[k]], countField as string);
            if (val) distinctValues.add(val.toLowerCase());
          }
          if (meetsCondition(distinctValues.size, config.condition)) {
            for (let k = windowStart; k <= i; k++) flagged.add(events[indices[k]].id);
          }
        }
      }
      return flagged;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  temporal (unordered)                                               */
/* ------------------------------------------------------------------ */

export function buildTemporalRule(config: CorrelationConfig): MultiEventRule {
  return {
    id: config.id,
    name: config.title,
    severity: config.severity,
    module: config.module,
    mitre: config.mitre,
    description: config.description,
    matchAll(events: WinEvent[]): Set<number> {
      const flagged = new Set<number>();
      if (config.baseRules.length < 2) return flagged;

      const perRule = collectPerRuleMatches(events, config.baseRules);

      // Build grouped indices per rule
      type GroupedEntry = { idx: number; ts: number };
      const groupedPerRule = new Map<string, Map<string, GroupedEntry[]>>();
      for (const [ruleId, indices] of perRule) {
        const grouped = new Map<string, GroupedEntry[]>();
        for (const idx of indices) {
          const key = getGroupKey(events[idx], config.groupBy, config.aliases, ruleId);
          if (!key) continue;
          let arr = grouped.get(key);
          if (!arr) { arr = []; grouped.set(key, arr); }
          arr.push({ idx, ts: eventTime(events[idx]) });
        }
        // Sort each group by time
        for (const entries of grouped.values()) entries.sort((a, b) => a.ts - b.ts);
        groupedPerRule.set(ruleId, grouped);
      }

      // Use first rule as anchor, check others have matches within timespan
      const ruleIds = [...perRule.keys()];
      const anchorRuleId = ruleIds[0];
      const anchorGroups = groupedPerRule.get(anchorRuleId)!;
      const otherRuleIds = ruleIds.slice(1);

      for (const [groupKey, anchorEntries] of anchorGroups) {
        for (const anchor of anchorEntries) {
          const participating: number[] = [anchor.idx];
          let allFound = true;

          for (const otherRuleId of otherRuleIds) {
            const otherGroups = groupedPerRule.get(otherRuleId)!;
            const otherEntries = otherGroups.get(groupKey);
            if (!otherEntries) { allFound = false; break; }

            // Find any match within ±timespan
            const match = otherEntries.find(
              (e) => Math.abs(e.ts - anchor.ts) <= config.timespanMs,
            );
            if (!match) { allFound = false; break; }
            participating.push(match.idx);
          }

          if (allFound) {
            for (const idx of participating) flagged.add(events[idx].id);
          }
        }
      }
      return flagged;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  temporal_ordered                                                   */
/* ------------------------------------------------------------------ */

export function buildTemporalOrderedRule(config: CorrelationConfig): MultiEventRule {
  return {
    id: config.id,
    name: config.title,
    severity: config.severity,
    module: config.module,
    mitre: config.mitre,
    description: config.description,
    matchAll(events: WinEvent[]): Set<number> {
      const flagged = new Set<number>();
      if (config.baseRules.length < 2) return flagged;

      const perRule = collectPerRuleMatches(events, config.baseRules);

      // Build grouped indices per rule (same as temporal)
      type GroupedEntry = { idx: number; ts: number };
      const groupedPerRule = new Map<string, Map<string, GroupedEntry[]>>();
      for (const [ruleId, indices] of perRule) {
        const grouped = new Map<string, GroupedEntry[]>();
        for (const idx of indices) {
          const key = getGroupKey(events[idx], config.groupBy, config.aliases, ruleId);
          if (!key) continue;
          let arr = grouped.get(key);
          if (!arr) { arr = []; grouped.set(key, arr); }
          arr.push({ idx, ts: eventTime(events[idx]) });
        }
        for (const entries of grouped.values()) entries.sort((a, b) => a.ts - b.ts);
        groupedPerRule.set(ruleId, grouped);
      }

      // Rules must be matched in order: rule[0].time < rule[1].time < ...
      // All within the timespan window
      const ruleIds = [...perRule.keys()];
      const firstRuleId = ruleIds[0];
      const firstGroups = groupedPerRule.get(firstRuleId)!;

      for (const [groupKey, firstEntries] of firstGroups) {
        for (const firstEntry of firstEntries) {
          const chain: number[] = [firstEntry.idx];
          let prevTs = firstEntry.ts;
          let chainValid = true;

          for (let r = 1; r < ruleIds.length; r++) {
            const ruleGroups = groupedPerRule.get(ruleIds[r])!;
            const entries = ruleGroups.get(groupKey);
            if (!entries) { chainValid = false; break; }

            // Find first match that is AFTER prevTs and within timespan of chain start
            const match = entries.find(
              (e) => e.ts > prevTs && e.ts - firstEntry.ts <= config.timespanMs,
            );
            if (!match) { chainValid = false; break; }
            chain.push(match.idx);
            prevTs = match.ts;
          }

          if (chainValid) {
            for (const idx of chain) flagged.add(events[idx].id);
          }
        }
      }
      return flagged;
    },
  };
}
