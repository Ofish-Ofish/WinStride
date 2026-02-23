import { compileSigmaYaml } from './sigmaCompiler';
import type { DetectionRule } from '../rules';

// Vite glob import: imports all .yml files as raw strings at build time
const yamlModules = import.meta.glob('./rules/**/*.yml', {
  eager: true,
  query: '?raw',
  import: 'default',
});

let _cachedRules: DetectionRule[] | null = null;

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
