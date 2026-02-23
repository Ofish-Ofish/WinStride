import { compileSigmaYaml } from './sigmaCompiler';
import { buildRuleIndex, compileCorrelationYaml } from './correlationCompiler';
import type { DetectionRule, MultiEventRule } from '../rules';

// Vite glob import: imports all .yml files as raw strings at build time
const yamlModules = import.meta.glob('./rules/**/*.yml', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// Correlation rules live in a separate directory
const correlationModules = import.meta.glob('./correlations/**/*.yml', {
  eager: true,
  query: '?raw',
  import: 'default',
});

let _cachedRules: DetectionRule[] | null = null;
let _cachedCorrelations: MultiEventRule[] | null = null;

export function getBundledSigmaRules(): DetectionRule[] {
  if (_cachedRules) return _cachedRules;

  const rules: DetectionRule[] = [];
  for (const raw of Object.values(yamlModules)) {
    if (typeof raw === 'string') {
      rules.push(...compileSigmaYaml(raw));
    }
  }

  _cachedRules = rules;
  return rules;
}

export function getBundledCorrelationRules(): MultiEventRule[] {
  if (_cachedCorrelations) return _cachedCorrelations;

  // Build rule index from all single-event rules (needed for reference resolution)
  const singleRules = getBundledSigmaRules();
  const ruleIndex = buildRuleIndex(singleRules);

  const correlations: MultiEventRule[] = [];
  for (const raw of Object.values(correlationModules)) {
    if (typeof raw === 'string') {
      correlations.push(...compileCorrelationYaml(raw, ruleIndex));
    }
  }

  if (correlations.length > 0) {
    console.log(`[Sigma] Compiled ${correlations.length} correlation rules`);
  }

  _cachedCorrelations = correlations;
  return correlations;
}
