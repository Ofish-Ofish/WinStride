import type { WinEvent } from '../modules/security/shared/types';

/* ------------------------------------------------------------------ */
/*  Column definition                                                  */
/* ------------------------------------------------------------------ */

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  sortable: boolean;
  flex: number;
  minWidth: number;
  getValue: (event: WinEvent) => string | number;
  /** Additional field names for search (e.g. 'host' as alias for 'machine' column) */
  searchKeys?: string[];
}

/* ------------------------------------------------------------------ */
/*  Sort                                                               */
/* ------------------------------------------------------------------ */

export type SortDir = 'asc' | 'desc' | null;

export function sortEvents(
  events: WinEvent[],
  columns: ColumnDef[],
  key: string,
  dir: SortDir,
  getSortValue?: (columnKey: string, event: WinEvent) => string | number | undefined,
): WinEvent[] {
  if (!dir) return events;
  const col = columns.find((c) => c.key === key);
  if (!col) return events;

  const sorted = [...events].sort((a, b) => {
    const va = getSortValue?.(key, a) ?? col.getValue(a);
    const vb = getSortValue?.(key, b) ?? col.getValue(b);
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb));
  });

  return dir === 'desc' ? sorted.reverse() : sorted;
}

export function nextSortDir(current: SortDir): SortDir {
  if (current === null) return 'asc';
  if (current === 'asc') return 'desc';
  return null;
}

/* ------------------------------------------------------------------ */
/*  Relative time                                                      */
/* ------------------------------------------------------------------ */

export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;

  if (diff < 0) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;

  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/* ------------------------------------------------------------------ */
/*  Search — column-driven field:value + plain text search             */
/* ------------------------------------------------------------------ */

/**
 * Filter events using search terms.  Supports:
 *  - Plain text:     `admin`            → substring match on all column values + extras
 *  - Field queries:  `user:admin`       → match on column key (or searchKeys alias)
 *  - Quoted values:  `user:"john doe"`
 *  - Multiple terms: `user:admin ip:192.168`  → all must match (AND)
 *
 * Field names are derived automatically from `columns[].key` + `columns[].searchKeys`.
 * Pass `getExtraFields` for fields not in columns (e.g. domain, subject, risk).
 */
export function applySearch(
  events: WinEvent[],
  search: string,
  columns: ColumnDef[],
  getExtraFields?: (event: WinEvent) => Record<string, string>,
): WinEvent[] {
  if (!search) return events;
  const terms = search.match(/(?:[^\s"]+|"[^"]*")+/g);
  if (!terms || terms.length === 0) return events;

  return events.filter((event) => {
    // Build field map from columns
    const fields: Record<string, string> = {};
    const textParts: string[] = [];
    for (const col of columns) {
      const val = String(col.getValue(event) ?? '');
      fields[col.key] = val;
      if (col.searchKeys) {
        for (const alias of col.searchKeys) fields[alias] = val;
      }
      textParts.push(val);
    }
    // Merge extra fields (non-column data + risk)
    if (getExtraFields) {
      const extras = getExtraFields(event);
      for (const [k, v] of Object.entries(extras)) {
        fields[k] = v;
        textParts.push(v);
      }
    }
    const text = textParts.join(' ').toLowerCase();

    return terms.every((term) => {
      const colonIdx = term.indexOf(':');
      if (colonIdx > 0) {
        const field = term.slice(0, colonIdx).toLowerCase();
        const value = term.slice(colonIdx + 1).toLowerCase().replace(/^"|"$/g, '');
        const fieldValue = fields[field];
        if (fieldValue !== undefined) return fieldValue.toLowerCase().includes(value);
      }
      return text.includes(term.toLowerCase().replace(/^"|"$/g, ''));
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Grid template                                                      */
/* ------------------------------------------------------------------ */

export function buildGridTemplate(cols: ColumnDef[]): string {
  return cols.map((c) => `minmax(${c.minWidth}px, ${c.flex}fr)`).join(' ');
}

/* ------------------------------------------------------------------ */
/*  Column visibility persistence                                      */
/* ------------------------------------------------------------------ */

export function loadVisibleColumns(storageKey: string, defaults: Set<string>): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set(defaults);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set(defaults);
    return new Set(arr.filter((k: unknown) => typeof k === 'string'));
  } catch {
    return new Set(defaults);
  }
}

export function saveVisibleColumns(storageKey: string, cols: Set<string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...cols]));
  } catch { /* quota */ }
}
