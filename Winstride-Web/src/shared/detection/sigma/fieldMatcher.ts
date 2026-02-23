import { getDataArray, getDataField, getSystemField } from '../../eventParsing';
import type { WinEvent } from '../../../modules/security/shared/types';

/** System-level fields that live in Event.System, not EventData.Data */
const SYSTEM_FIELDS = new Set([
  'Provider_Name', 'Provider_Guid', 'Channel', 'Computer',
]);

/**
 * Parse a Sigma field key like "CommandLine|contains|all" into
 * { fieldName: 'CommandLine', modifiers: ['contains', 'all'] }
 */
export function parseFieldKey(key: string): { fieldName: string; modifiers: string[] } {
  const parts = key.split('|');
  return { fieldName: parts[0], modifiers: parts.slice(1) };
}

/**
 * Per-event field value cache.
 * Multiple Sigma rules often check the same field (e.g. CommandLine) on the
 * same event. Caching avoids redundant linear scans of the Data array.
 */
const _fieldValueCache = new WeakMap<WinEvent, Map<string, string>>();

/**
 * Get a field value from a WinEvent (cached per event+field).
 * Handles special Sigma pseudo-fields: EventID maps to e.eventId.
 * System-level fields (Provider_Name, Channel, etc.) are fetched from Event.System.
 */
export function getField(event: WinEvent, fieldName: string): string {
  if (fieldName === 'EventID') return String(event.eventId);
  if (SYSTEM_FIELDS.has(fieldName)) return getSystemField(event, fieldName);

  let cache = _fieldValueCache.get(event);
  if (cache) {
    const cached = cache.get(fieldName);
    if (cached !== undefined) return cached;
  }

  const arr = getDataArray(event);
  if (!arr) return '';
  const value = getDataField(arr, fieldName);

  if (!cache) { cache = new Map(); _fieldValueCache.set(event, cache); }
  cache.set(fieldName, value);
  return value;
}

/**
 * Expand a single value into variants when `windash` modifier is active.
 * Sigma `windash` means: if the value contains a dash (`-`) used as a flag
 * prefix, also match the `/` variant (Windows accepts both).
 */
function expandWindash(raw: string): string[] {
  // Replace leading dash or dash preceded by a space with `/`
  const alt = raw.replace(/(^| )-/g, '$1/');
  return alt !== raw ? [raw, alt] : [raw];
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
 * windash: expand `-flag` to also match `/flag`.
 * cidr: match an IP field against a CIDR range.
 */
export function buildFieldPredicate(
  fieldName: string,
  modifiers: string[],
  values: unknown[],
): (event: WinEvent) => boolean {
  const isCased = modifiers.includes('cased');
  const isAll = modifiers.includes('all');
  const isRe = modifiers.includes('re');
  const isWindash = modifiers.includes('windash');
  const isCidr = modifiers.includes('cidr');

  // Determine match mode from modifiers (excluding meta-modifiers)
  const modeModifiers = modifiers.filter((m) => m !== 'all' && m !== 'cased' && m !== 'windash' && m !== 'cidr');
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

  // CIDR matching — parse prefix once, match IPs at runtime
  if (isCidr) {
    const cidrs = values
      .filter((v) => v != null)
      .map((v) => parseCidr(String(v)))
      .filter((c) => c !== null) as CidrRange[];
    return (event: WinEvent) => {
      const ip = getField(event, fieldName);
      if (!ip) return false;
      const ipNum = ipToNumber(ip);
      if (ipNum === null) return false;
      if (isAll) return cidrs.every((c) => (ipNum & c.mask) === c.network);
      return cidrs.some((c) => (ipNum & c.mask) === c.network);
    };
  }

  // Pre-compile matchers for each value (with windash expansion)
  const matchers: ((fieldValue: string) => boolean)[] = values.flatMap((v) => {
    if (v === null || v === undefined) return [() => false];
    const raw = String(v);
    const variants = isWindash ? expandWindash(raw) : [raw];
    return variants.map((variant) => {
      if (mode === 're') {
        try {
          const regex = new RegExp(variant, isCased ? '' : 'i');
          return (fv: string) => regex.test(fv);
        } catch {
          return () => false;
        }
      }
      const pattern = isCased ? variant : variant.toLowerCase();
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
  });

  // For windash + all: group matchers by original value so each original
  // value must match (via any of its variants), not every individual variant.
  if (isWindash && isAll) {
    const grouped: ((fieldValue: string) => boolean)[][] = values.map((v) => {
      if (v === null || v === undefined) return [() => false];
      const raw = String(v);
      const variants = expandWindash(raw);
      return variants.map((variant) => {
        const pattern = isCased ? variant : variant.toLowerCase();
        switch (mode) {
          case 'contains':
            return (fv: string) => (isCased ? fv : fv.toLowerCase()).includes(pattern);
          case 'endswith':
            return (fv: string) => (isCased ? fv : fv.toLowerCase()).endsWith(pattern);
          case 'startswith':
            return (fv: string) => (isCased ? fv : fv.toLowerCase()).startsWith(pattern);
          default:
            return (fv: string) => (isCased ? fv : fv.toLowerCase()) === pattern;
        }
      });
    });
    return (event: WinEvent) => {
      const fieldValue = getField(event, fieldName);
      return grouped.every((variantMatchers) => variantMatchers.some((m) => m(fieldValue)));
    };
  }

  return (event: WinEvent) => {
    const fieldValue = getField(event, fieldName);
    if (isAll) {
      return matchers.every((m) => m(fieldValue));
    }
    return matchers.some((m) => m(fieldValue));
  };
}

/* ---- CIDR helpers ---- */

interface CidrRange {
  network: number;
  mask: number;
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const octet = parseInt(p, 10);
    if (isNaN(octet) || octet < 0 || octet > 255) return null;
    num = (num << 8) | octet;
  }
  return num >>> 0; // unsigned 32-bit
}

function parseCidr(cidr: string): CidrRange | null {
  const [ip, prefixStr] = cidr.split('/');
  const ipNum = ipToNumber(ip);
  if (ipNum === null) return null;
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { network: (ipNum & mask) >>> 0, mask };
}
