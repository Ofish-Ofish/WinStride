import type { WinEvent } from '../../security/shared/types';
import { SYSMON_EVENT_LABELS } from '../shared/eventMeta';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';

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
/*  Column definitions                                                 */
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

function getProcessName(event: WinEvent): string {
  if (event.eventId === 1) return parseProcessCreate(event)?.imageName ?? '';
  if (event.eventId === 3) return parseNetworkConnect(event)?.imageName ?? '';
  if (event.eventId === 11) return parseFileCreate(event)?.imageName ?? '';
  return '';
}

function getDetail(event: WinEvent): string {
  if (event.eventId === 1) {
    const p = parseProcessCreate(event);
    return p?.commandLine.slice(0, 80) ?? '';
  }
  if (event.eventId === 3) {
    const n = parseNetworkConnect(event);
    if (!n) return '';
    return `\u2192${n.destinationIp}:${n.destinationPort}`;
  }
  if (event.eventId === 11) {
    return parseFileCreate(event)?.targetBasename ?? '';
  }
  return '';
}

function getUser(event: WinEvent): string {
  if (event.eventId === 1) return parseProcessCreate(event)?.user ?? '';
  if (event.eventId === 3) return parseNetworkConnect(event)?.user ?? '';
  if (event.eventId === 11) return parseFileCreate(event)?.user ?? '';
  return '';
}

export const COLUMNS: ColumnDef[] = [
  {
    key: 'type',
    label: 'Type',
    defaultVisible: true,
    sortable: true,
    flex: 1.5,
    minWidth: 150,
    getValue: (e) => e.eventId,
  },
  {
    key: 'process',
    label: 'Process',
    defaultVisible: true,
    sortable: true,
    flex: 2,
    minWidth: 130,
    getValue: getProcessName,
  },
  {
    key: 'detail',
    label: 'Detail',
    defaultVisible: true,
    sortable: true,
    flex: 4,
    minWidth: 200,
    getValue: getDetail,
  },
  {
    key: 'user',
    label: 'User',
    defaultVisible: true,
    sortable: true,
    flex: 2,
    minWidth: 120,
    getValue: getUser,
  },
  {
    key: 'integrity',
    label: 'Integrity',
    defaultVisible: false,
    sortable: true,
    flex: 1,
    minWidth: 80,
    getValue: (e) => {
      if (e.eventId === 1) return parseProcessCreate(e)?.integrityLevel ?? '';
      return '';
    },
  },
  {
    key: 'machine',
    label: 'Machine',
    defaultVisible: true,
    sortable: true,
    flex: 1.5,
    minWidth: 110,
    getValue: (e) => e.machineName,
  },
  {
    key: 'time',
    label: 'Time',
    defaultVisible: true,
    sortable: true,
    flex: 1,
    minWidth: 90,
    getValue: (e) => e.timeCreated,
  },
  {
    key: 'parent',
    label: 'Parent',
    defaultVisible: false,
    sortable: true,
    flex: 1.5,
    minWidth: 110,
    getValue: (e) => {
      if (e.eventId === 1) return parseProcessCreate(e)?.parentImageName ?? '';
      return '';
    },
  },
  {
    key: 'hashes',
    label: 'Hashes',
    defaultVisible: false,
    sortable: false,
    flex: 3,
    minWidth: 200,
    getValue: (e) => {
      if (e.eventId === 1) return parseProcessCreate(e)?.hashes?.slice(0, 40) ?? '';
      return '';
    },
  },
];

export function buildGridTemplate(cols: ColumnDef[]): string {
  return cols.map((c) => `minmax(${c.minWidth}px, ${c.flex}fr)`).join(' ');
}

export const DEFAULT_VISIBLE_COLUMNS = new Set(
  COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
);

/* ------------------------------------------------------------------ */
/*  Sorting                                                            */
/* ------------------------------------------------------------------ */

export type SortDir = 'asc' | 'desc' | null;

export function sortEvents(events: WinEvent[], key: string, dir: SortDir): WinEvent[] {
  if (!dir) return events;
  const col = COLUMNS.find((c) => c.key === key);
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
/*  Export                                                             */
/* ------------------------------------------------------------------ */

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(events: WinEvent[], visibleColumns: Set<string>): void {
  const cols = COLUMNS.filter((c) => visibleColumns.has(c.key));
  const header = cols.map((c) => c.label).join(',');
  const rows = events.map((e) =>
    cols.map((c) => {
      let val = String(c.getValue(e));
      if (c.key === 'type') {
        const label = SYSMON_EVENT_LABELS[e.eventId];
        if (label) val = `${e.eventId} ${label}`;
      }
      if (c.key === 'time') val = new Date(e.timeCreated).toISOString();
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','),
  );

  const csv = [header, ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(csv, `winstride-sysmon-${date}.csv`, 'text/csv');
}

export function exportJSON(events: WinEvent[]): void {
  const data = events.map((e) => {
    const proc = parseProcessCreate(e);
    const net = parseNetworkConnect(e);
    const file = parseFileCreate(e);
    return {
      id: e.id,
      eventId: e.eventId,
      eventLabel: SYSMON_EVENT_LABELS[e.eventId] ?? null,
      machineName: e.machineName,
      timeCreated: e.timeCreated,
      process: getProcessName(e),
      detail: getDetail(e),
      user: getUser(e),
    };
  });

  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(JSON.stringify(data, null, 2), `winstride-sysmon-${date}.json`, 'application/json');
}

/* ------------------------------------------------------------------ */
/*  localStorage for column visibility                                 */
/* ------------------------------------------------------------------ */

const COLUMNS_STORAGE_KEY = 'winstride:sysmonColumns';

export function loadVisibleColumns(): Set<string> {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return new Set(DEFAULT_VISIBLE_COLUMNS);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set(DEFAULT_VISIBLE_COLUMNS);
    return new Set(arr.filter((k: unknown) => typeof k === 'string'));
  } catch {
    return new Set(DEFAULT_VISIBLE_COLUMNS);
  }
}

export function saveVisibleColumns(cols: Set<string>): void {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...cols]));
  } catch { /* quota */ }
}
