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
): WinEvent[] {
  if (!dir) return events;
  const col = columns.find((c) => c.key === key);
  if (!col) return events;

  const sorted = [...events].sort((a, b) => {
    const va = col.getValue(a);
    const vb = col.getValue(b);
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
