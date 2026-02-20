import type { WinEvent } from '../shared/types';
import { EVENT_LABELS, LOGON_TYPE_LABELS } from '../shared/eventMeta';

/* ------------------------------------------------------------------ */
/*  Event data parsing                                                 */
/* ------------------------------------------------------------------ */

export interface ParsedEventData {
  targetUserName: string;
  targetDomainName: string;
  subjectUserName: string;
  subjectDomainName: string;
  logonType: number;
  logonTypeLabel: string;
  ipAddress: string;
  ipPort: string;
  authPackage: string;
  logonProcess: string;
  workstationName: string;
  processName: string;
  keyLength: number;
  elevatedToken: boolean;
  failureStatus: string;
  failureSubStatus: string;
  raw: unknown;
}

function getDataField(dataArray: unknown[], fieldName: string): string {
  if (!Array.isArray(dataArray)) return '';
  for (const item of dataArray) {
    if (
      item &&
      typeof item === 'object' &&
      (item as Record<string, string>)['@Name'] === fieldName
    ) {
      return (item as Record<string, string>)['#text'] ?? '';
    }
  }
  return '';
}

const parseCache = new WeakMap<WinEvent, ParsedEventData | null>();

export function parseEventData(event: WinEvent): ParsedEventData | null {
  if (parseCache.has(event)) return parseCache.get(event)!;

  if (!event.eventData) {
    parseCache.set(event, null);
    return null;
  }

  try {
    const parsed = JSON.parse(event.eventData);
    const eventObj = parsed?.Event ?? parsed;
    const eventData = eventObj?.EventData;
    if (!eventData) { parseCache.set(event, null); return null; }

    let dataArray = eventData.Data;
    if (!dataArray) { parseCache.set(event, null); return null; }
    if (!Array.isArray(dataArray)) dataArray = [dataArray];

    const logonTypeStr = getDataField(dataArray, 'LogonType');
    const logonType = logonTypeStr ? parseInt(logonTypeStr, 10) : -1;
    const keyLengthStr = getDataField(dataArray, 'KeyLength');
    const elevatedStr = getDataField(dataArray, 'ElevatedToken');

    const result: ParsedEventData = {
      targetUserName: getDataField(dataArray, 'TargetUserName'),
      targetDomainName: getDataField(dataArray, 'TargetDomainName'),
      subjectUserName: getDataField(dataArray, 'SubjectUserName'),
      subjectDomainName: getDataField(dataArray, 'SubjectDomainName'),
      logonType,
      logonTypeLabel: LOGON_TYPE_LABELS[logonType] ?? (logonType >= 0 ? `Type ${logonType}` : ''),
      ipAddress: getDataField(dataArray, 'IpAddress') || '-',
      ipPort: getDataField(dataArray, 'IpPort') || '',
      authPackage: getDataField(dataArray, 'AuthenticationPackageName'),
      logonProcess: getDataField(dataArray, 'LogonProcessName'),
      workstationName: getDataField(dataArray, 'WorkstationName'),
      processName: getDataField(dataArray, 'ProcessName'),
      keyLength: keyLengthStr ? parseInt(keyLengthStr, 10) : -1,
      elevatedToken: elevatedStr === '%%1842',
      failureStatus: getDataField(dataArray, 'Status'),
      failureSubStatus: getDataField(dataArray, 'SubStatus'),
      raw: parsed,
    };

    parseCache.set(event, result);
    return result;
  } catch {
    parseCache.set(event, null);
    return null;
  }
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
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  sortable: boolean;
  flex: number;       // relative flex weight for grid column sizing
  minWidth: number;   // minimum width in px
  getValue: (event: WinEvent) => string | number;
}

export const COLUMNS: ColumnDef[] = [
  {
    key: 'eventId',
    label: 'Event ID',
    defaultVisible: true,
    sortable: true,
    flex: 2,
    minWidth: 150,
    getValue: (e) => e.eventId,
  },
  {
    key: 'level',
    label: 'Level',
    defaultVisible: true,
    sortable: true,
    flex: 1,
    minWidth: 90,
    getValue: (e) => e.level ?? '',
  },
  {
    key: 'user',
    label: 'User',
    defaultVisible: true,
    sortable: true,
    flex: 2,
    minWidth: 120,
    getValue: (e) => parseEventData(e)?.targetUserName ?? '',
  },
  {
    key: 'machine',
    label: 'Machine',
    defaultVisible: true,
    sortable: true,
    flex: 2,
    minWidth: 120,
    getValue: (e) => e.machineName,
  },
  {
    key: 'logonType',
    label: 'Logon Type',
    defaultVisible: true,
    sortable: true,
    flex: 1.2,
    minWidth: 100,
    getValue: (e) => parseEventData(e)?.logonTypeLabel ?? '',
  },
  {
    key: 'ip',
    label: 'IP',
    defaultVisible: false,
    sortable: true,
    flex: 1.5,
    minWidth: 110,
    getValue: (e) => {
      const ip = parseEventData(e)?.ipAddress;
      return ip && ip !== '-' ? ip : '';
    },
  },
  {
    key: 'time',
    label: 'Time',
    defaultVisible: true,
    sortable: true,
    flex: 1.2,
    minWidth: 100,
    getValue: (e) => e.timeCreated,
  },
];

/** Build CSS grid-template-columns from active columns */
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
      if (c.key === 'eventId') {
        const label = EVENT_LABELS[e.eventId];
        if (label) val = `${e.eventId} ${label}`;
      }
      if (c.key === 'time') val = new Date(e.timeCreated).toISOString();
      // Escape CSV
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','),
  );

  const csv = [header, ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(csv, `winstride-events-${date}.csv`, 'text/csv');
}

export function exportJSON(events: WinEvent[]): void {
  const data = events.map((e) => {
    const parsed = parseEventData(e);
    return {
      id: e.id,
      eventId: e.eventId,
      eventLabel: EVENT_LABELS[e.eventId] ?? null,
      level: e.level,
      machineName: e.machineName,
      timeCreated: e.timeCreated,
      user: parsed?.targetUserName ?? null,
      logonType: parsed?.logonTypeLabel ?? null,
      ipAddress: parsed?.ipAddress ?? null,
    };
  });

  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(JSON.stringify(data, null, 2), `winstride-events-${date}.json`, 'application/json');
}

/* ------------------------------------------------------------------ */
/*  localStorage for column visibility                                 */
/* ------------------------------------------------------------------ */

const COLUMNS_STORAGE_KEY = 'winstride:listColumns';

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
