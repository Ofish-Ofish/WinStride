const OFFSETLESS_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const TOP_LEVEL_TIMESTAMP_KEYS = new Set([
  'time',
  'timestamp',
  'timeCreated',
  'timeSynced',
  'firstSeen',
  'lastSeen',
]);

export function normalizeApiTimestamp(value: string): string {
  return OFFSETLESS_ISO_RE.test(value) ? `${value}Z` : value;
}

export function parseTimestamp(value: string): Date {
  return new Date(normalizeApiTimestamp(value));
}

export function normalizeApiItems<T>(items: T[]): T[] {
  return items.map((item) => normalizeApiItem(item));
}

function normalizeApiItem<T>(item: T): T {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;

  let changed = false;
  const clone: Record<string, unknown> = { ...(item as Record<string, unknown>) };

  for (const key of TOP_LEVEL_TIMESTAMP_KEYS) {
    const raw = clone[key];
    if (typeof raw !== 'string') continue;

    const normalized = normalizeApiTimestamp(raw);
    if (normalized === raw) continue;

    clone[key] = normalized;
    changed = true;
  }

  return changed ? (clone as T) : item;
}
