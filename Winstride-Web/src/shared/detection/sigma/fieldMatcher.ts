import { getDataArray, getDataField } from '../../eventParsing';
import type { WinEvent } from '../../../modules/security/shared/types';

/**
 * Parse a Sigma field key like "CommandLine|contains|all" into
 * { fieldName: 'CommandLine', modifiers: ['contains', 'all'] }
 */
export function parseFieldKey(key: string): { fieldName: string; modifiers: string[] } {
  const parts = key.split('|');
  return { fieldName: parts[0], modifiers: parts.slice(1) };
}

/**
 * Get a field value from a WinEvent.
 * Handles special Sigma pseudo-fields: EventID maps to e.eventId.
 */
export function getField(event: WinEvent, fieldName: string): string {
  if (fieldName === 'EventID') return String(event.eventId);
  const arr = getDataArray(event);
  if (!arr) return '';
  return getDataField(arr, fieldName);
}

/**
 * Build a predicate that checks one field against one or more values,
 * applying the given Sigma modifiers.
 *
 * Default (no modifier): case-insensitive exact match.
 * contains: case-insensitive substring.
 * endswith: case-insensitive suffix.
 * startswith: case-insensitive prefix.
 * re: regex match.
 * all: changes list semantics from OR to AND.
 * cased: makes matching case-sensitive.
 */
export function buildFieldPredicate(
  fieldName: string,
  modifiers: string[],
  values: unknown[],
): (event: WinEvent) => boolean {
  const isCased = modifiers.includes('cased');
  const isAll = modifiers.includes('all');
  const isRe = modifiers.includes('re');

  // Determine match mode from modifiers (excluding 'all', 'cased')
  const modeModifiers = modifiers.filter((m) => m !== 'all' && m !== 'cased');
  const mode: 'exact' | 'contains' | 'endswith' | 'startswith' | 're' =
    isRe
      ? 're'
      : modeModifiers.includes('contains')
        ? 'contains'
        : modeModifiers.includes('endswith')
          ? 'endswith'
          : modeModifiers.includes('startswith')
            ? 'startswith'
            : 'exact';

  // Pre-compile matchers for each value
  const matchers: ((fieldValue: string) => boolean)[] = values.map((v) => {
    if (v === null || v === undefined) return () => false;
    const raw = String(v);
    if (mode === 're') {
      try {
        const regex = new RegExp(raw, isCased ? '' : 'i');
        return (fv: string) => regex.test(fv);
      } catch {
        return () => false;
      }
    }
    const pattern = isCased ? raw : raw.toLowerCase();
    switch (mode) {
      case 'contains':
        return (fv: string) => (isCased ? fv : fv.toLowerCase()).includes(pattern);
      case 'endswith':
        return (fv: string) => (isCased ? fv : fv.toLowerCase()).endsWith(pattern);
      case 'startswith':
        return (fv: string) => (isCased ? fv : fv.toLowerCase()).startsWith(pattern);
      default: // exact
        return (fv: string) => (isCased ? fv : fv.toLowerCase()) === pattern;
    }
  });

  return (event: WinEvent) => {
    const fieldValue = getField(event, fieldName);
    if (isAll) {
      return matchers.every((m) => m(fieldValue));
    }
    return matchers.some((m) => m(fieldValue));
  };
}
