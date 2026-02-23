import yaml from 'js-yaml';
import type { WinEvent } from '../../../modules/security/shared/types';
import type { DetectionRule, Severity, Module } from '../rules';
import { parseFieldKey, buildFieldPredicate } from './fieldMatcher';
import { parseCondition, evaluateCondition } from './conditionParser';

/* ------------------------------------------------------------------ */
/*  Logsource -> Module + EventID mapping                              */
/* ------------------------------------------------------------------ */

interface LogsourceMapping {
  module: Module;
  eventIds?: number[];
}

const CATEGORY_MAP: Record<string, LogsourceMapping> = {
  process_creation: { module: 'sysmon', eventIds: [1] },
  network_connection: { module: 'sysmon', eventIds: [3] },
  file_event: { module: 'sysmon', eventIds: [11] },
  image_load: { module: 'sysmon', eventIds: [7] },
  driver_load: { module: 'sysmon', eventIds: [6] },
  registry_set: { module: 'sysmon', eventIds: [13] },
  registry_add: { module: 'sysmon', eventIds: [12] },
  registry_event: { module: 'sysmon', eventIds: [12, 13, 14] },
  registry_rename: { module: 'sysmon', eventIds: [14] },
  registry_delete: { module: 'sysmon', eventIds: [12] },
  create_remote_thread: { module: 'sysmon', eventIds: [8] },
  process_access: { module: 'sysmon', eventIds: [10] },
  pipe_created: { module: 'sysmon', eventIds: [17, 18] },
  dns_query: { module: 'sysmon', eventIds: [22] },
  file_delete: { module: 'sysmon', eventIds: [23, 26] },
  process_tampering: { module: 'sysmon', eventIds: [25] },
  ps_script: { module: 'powershell', eventIds: [4104] },
  ps_module: { module: 'powershell', eventIds: [4103] },
};

const SERVICE_MAP: Record<string, Module> = {
  security: 'security',
  sysmon: 'sysmon',
  'powershell-classic': 'powershell',
};

/* ------------------------------------------------------------------ */
/*  Severity mapping                                                    */
/* ------------------------------------------------------------------ */

export const LEVEL_MAP: Record<string, Severity> = {
  informational: 'info',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
};

/* ------------------------------------------------------------------ */
/*  Extract EventIDs from detection blocks (for indexing)              */
/* ------------------------------------------------------------------ */

function collectEventIds(block: unknown, ids: Set<number>): void {
  if (Array.isArray(block)) {
    for (const item of block) collectEventIds(item, ids);
    return;
  }
  if (typeof block !== 'object' || block === null) return;
  for (const [key, val] of Object.entries(block as Record<string, unknown>)) {
    if (key === 'EventID' || key === 'eventid' || key === 'eventId') {
      if (typeof val === 'number') ids.add(val);
      else if (typeof val === 'string') { const n = parseInt(val, 10); if (!isNaN(n)) ids.add(n); }
      else if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === 'number') ids.add(v);
          else if (typeof v === 'string') { const n = parseInt(v, 10); if (!isNaN(n)) ids.add(n); }
        }
      }
    }
  }
}

function extractEventIdsFromBlocks(detection: Record<string, unknown>): number[] | undefined {
  const ids = new Set<number>();
  for (const [key, block] of Object.entries(detection)) {
    if (key === 'condition') continue;
    collectEventIds(block, ids);
  }
  return ids.size > 0 ? [...ids] : undefined;
}

/* ------------------------------------------------------------------ */
/*  Parse a detection block into a predicate                           */
/* ------------------------------------------------------------------ */

function buildBlockPredicate(block: unknown): (event: WinEvent) => boolean {
  // A block can be:
  // 1. A map of { field: value(s) } — all fields ANDed
  // 2. A list of maps — ORed between maps

  if (Array.isArray(block)) {
    const predicates = block.map((item) => buildBlockPredicate(item));
    return (event) => predicates.some((p) => p(event));
  }

  if (typeof block === 'object' && block !== null) {
    const entries = Object.entries(block as Record<string, unknown>);
    const fieldPredicates = entries.map(([key, rawValues]) => {
      const { fieldName, modifiers } = parseFieldKey(key);
      const values = Array.isArray(rawValues) ? rawValues : [rawValues];
      return buildFieldPredicate(fieldName, modifiers, values);
    });
    // All field conditions within a block are ANDed
    return (event) => fieldPredicates.every((p) => p(event));
  }

  // Fallback: always false for unsupported block types
  return () => false;
}

/* ------------------------------------------------------------------ */
/*  MITRE extraction from tags                                         */
/* ------------------------------------------------------------------ */

function extractMitre(tags?: string[]): string | undefined {
  if (!tags) return undefined;
  const mitreTags = tags
    .filter((t) => t.startsWith('attack.t'))
    .map((t) => t.replace('attack.', '').toUpperCase());
  return mitreTags.length > 0 ? mitreTags[0] : undefined;
}

/* ------------------------------------------------------------------ */
/*  Compile one Sigma rule YAML document into a DetectionRule          */
/* ------------------------------------------------------------------ */

export interface SigmaRuleYaml {
  title?: string;
  name?: string;
  id?: string;
  description?: string;
  level?: string;
  status?: string;
  tags?: string[];
  logsource?: { category?: string; service?: string; product?: string };
  detection?: Record<string, unknown>;
  correlation?: Record<string, unknown>;
  [key: string]: unknown;
}

export function compileSigmaRule(raw: SigmaRuleYaml): DetectionRule | null {
  // Skip correlation documents — handled by correlationCompiler
  if (raw.correlation) return null;

  const { title, name: sigmaName, id, description, level, tags, logsource, detection } = raw;

  if (!detection || !logsource) return null;

  // Skip deprecated/unsupported rules
  if (raw.status === 'deprecated' || raw.status === 'unsupported') return null;

  // Resolve module + eventIds from logsource
  let mapping: LogsourceMapping | undefined;
  if (logsource.category && CATEGORY_MAP[logsource.category]) {
    mapping = CATEGORY_MAP[logsource.category];
  } else if (logsource.service && SERVICE_MAP[logsource.service]) {
    mapping = { module: SERVICE_MAP[logsource.service] };
  }
  if (!mapping) return null;

  const severity = LEVEL_MAP[level ?? 'informational'] ?? 'info';
  const mitre = extractMitre(tags);
  const ruleId = id ? `SIGMA-${id.slice(0, 8)}` : `SIGMA-${(title ?? 'unknown').slice(0, 20)}`;

  // Extract EventIDs from detection blocks (for rules without logsource eventIds)
  const detectedEventIds = mapping.eventIds ?? extractEventIdsFromBlocks(detection);

  // Separate detection blocks from the condition string
  const { condition: conditionStr, ...blocks } = detection;
  if (typeof conditionStr !== 'string') return null;

  // Handle pipe-separated conditions (multiple conditions = OR between them)
  // Some Sigma rules use "condition: sel1 | sel2" which means multiple independent conditions
  const conditionParts = conditionStr.includes(' | ')
    ? conditionStr.split(' | ').map((s) => s.trim())
    : [conditionStr.trim()];

  // Parse each condition part
  const conditionAsts = conditionParts
    .map((part) => {
      try {
        return parseCondition(part);
      } catch {
        return null;
      }
    })
    .filter((ast) => ast !== null);

  if (conditionAsts.length === 0) return null;

  // Build predicates for each named block
  const blockPredicates = new Map<string, (event: WinEvent) => boolean>();
  for (const [name, blockDef] of Object.entries(blocks)) {
    blockPredicates.set(name, buildBlockPredicate(blockDef));
  }

  // Build the match function
  const eventIdSet = mapping.eventIds ? new Set(mapping.eventIds) : null;
  const matchFn = (event: WinEvent): boolean => {
    // Guard on event ID if the logsource maps to specific IDs
    if (eventIdSet && !eventIdSet.has(event.eventId)) return false;

    // Evaluate each named detection block
    const blockResults = new Map<string, boolean>();
    for (const [name, pred] of blockPredicates) {
      blockResults.set(name, pred(event));
    }

    // Any condition part matching is sufficient (OR between pipe-separated conditions)
    return conditionAsts.some((ast) => evaluateCondition(ast!, blockResults));
  };

  return {
    id: ruleId,
    name: title ?? 'Unnamed Sigma Rule',
    severity,
    module: mapping.module,
    mitre,
    description: description ?? '',
    eventIds: detectedEventIds,
    sigmaId: id,
    sigmaName: sigmaName,
    match: matchFn,
  };
}

/* ------------------------------------------------------------------ */
/*  Compile a YAML string (may contain multiple documents)             */
/* ------------------------------------------------------------------ */

export function compileSigmaYaml(yamlContent: string): DetectionRule[] {
  const rules: DetectionRule[] = [];
  try {
    yaml.loadAll(yamlContent, (doc) => {
      if (doc && typeof doc === 'object') {
        const rule = compileSigmaRule(doc as SigmaRuleYaml);
        if (rule) rules.push(rule);
      }
    });
  } catch {
    // Skip malformed YAML files silently
  }
  return rules;
}
