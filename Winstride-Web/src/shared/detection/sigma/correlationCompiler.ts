import yaml from 'js-yaml';
import type { DetectionRule, MultiEventRule, Severity, Module } from '../rules';
import type { SigmaRuleYaml } from './sigmaCompiler';
import { LEVEL_MAP } from './sigmaCompiler';
import {
  parseTimespan,
  buildEventCountRule,
  buildValueCountRule,
  buildTemporalRule,
  buildTemporalOrderedRule,
  type CorrelationConfig,
  type CorrelationCondition,
} from './correlationEngine';

/* ------------------------------------------------------------------ */
/*  Rule index for reference resolution                                */
/* ------------------------------------------------------------------ */

export type RuleIndex = Map<string, DetectionRule>;

/** Build a lookup index keyed by sigmaId (UUID) and sigmaName */
export function buildRuleIndex(rules: DetectionRule[]): RuleIndex {
  const index: RuleIndex = new Map();
  for (const rule of rules) {
    if (rule.sigmaId) index.set(rule.sigmaId, rule);
    if (rule.sigmaName) index.set(rule.sigmaName, rule);
  }
  return index;
}

/* ------------------------------------------------------------------ */
/*  MITRE extraction (shared with sigmaCompiler pattern)               */
/* ------------------------------------------------------------------ */

function extractMitre(tags?: string[]): string | undefined {
  if (!tags) return undefined;
  const mitreTags = tags
    .filter((t) => t.startsWith('attack.t'))
    .map((t) => t.replace('attack.', '').toUpperCase());
  return mitreTags.length > 0 ? mitreTags[0] : undefined;
}

/* ------------------------------------------------------------------ */
/*  Parse a correlation YAML document                                  */
/* ------------------------------------------------------------------ */

interface CorrelationYaml {
  type: string;
  rules: string[];
  'group-by'?: string[];
  timespan: string;
  condition: Record<string, unknown>;
  aliases?: Record<string, Record<string, string>>;
}

function resolveModule(baseRules: DetectionRule[]): Module {
  // If all referenced rules share the same module, use it
  const modules = new Set(baseRules.map((r) => r.module));
  if (modules.size === 1) return [...modules][0];
  // Mixed modules: default to 'security' as the broadest module
  return 'security';
}

export function compileCorrelationRule(
  raw: SigmaRuleYaml,
  ruleIndex: RuleIndex,
): MultiEventRule | null {
  const correlation = raw.correlation as CorrelationYaml | undefined;
  if (!correlation) return null;

  const { type, rules: ruleRefs, timespan, condition: rawCondition } = correlation;
  if (!type || !ruleRefs || !timespan || !rawCondition) return null;

  // Resolve base rule references
  const baseRules: DetectionRule[] = [];
  for (const ref of ruleRefs) {
    const resolved = ruleIndex.get(ref);
    if (resolved) baseRules.push(resolved);
  }
  if (baseRules.length === 0) return null;

  // Parse timespan
  let timespanMs: number;
  try {
    timespanMs = parseTimespan(timespan);
  } catch {
    return null;
  }

  // Parse condition
  const condition: CorrelationCondition = {};
  for (const [key, val] of Object.entries(rawCondition)) {
    if (key === 'field') {
      condition.field = String(val);
    } else {
      condition[key] = Number(val);
    }
  }

  // Parse group-by
  const groupBy = correlation['group-by'] ?? [];

  // Parse aliases: { virtualField: { ruleName: actualField } }
  let aliases: Map<string, Map<string, string>> | undefined;
  if (correlation.aliases) {
    aliases = new Map();
    for (const [virtualField, mapping] of Object.entries(correlation.aliases)) {
      const ruleMap = new Map<string, string>();
      for (const [ruleRef, actualField] of Object.entries(mapping)) {
        // Resolve the rule reference to get its compiled id
        const resolved = ruleIndex.get(ruleRef);
        if (resolved) ruleMap.set(resolved.id, actualField);
      }
      aliases.set(virtualField, ruleMap);
    }
  }

  const severity: Severity = LEVEL_MAP[raw.level ?? 'informational'] ?? 'info';
  const mitre = extractMitre(raw.tags);
  const ruleId = raw.id
    ? `SIGMA-COR-${raw.id.slice(0, 8)}`
    : `SIGMA-COR-${(raw.title ?? 'unknown').slice(0, 16)}`;

  const config: CorrelationConfig = {
    id: ruleId,
    title: raw.title ?? 'Unnamed Correlation',
    severity,
    module: resolveModule(baseRules),
    mitre,
    description: raw.description ?? '',
    baseRules,
    groupBy,
    timespanMs,
    condition,
    aliases,
  };

  switch (type) {
    case 'event_count':
      return buildEventCountRule(config);
    case 'value_count':
      return buildValueCountRule(config);
    case 'temporal':
      return buildTemporalRule(config);
    case 'temporal_ordered':
      return buildTemporalOrderedRule(config);
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Compile correlation YAML string(s)                                 */
/* ------------------------------------------------------------------ */

export function compileCorrelationYaml(
  yamlContent: string,
  ruleIndex: RuleIndex,
): MultiEventRule[] {
  const rules: MultiEventRule[] = [];
  try {
    yaml.loadAll(yamlContent, (doc) => {
      if (doc && typeof doc === 'object') {
        const raw = doc as SigmaRuleYaml;
        if (raw.correlation) {
          const rule = compileCorrelationRule(raw, ruleIndex);
          if (rule) rules.push(rule);
        }
      }
    });
  } catch {
    // Skip malformed YAML files silently
  }
  return rules;
}
