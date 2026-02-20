import type { WinEvent } from '../modules/security/shared/types';
import type { ColumnDef } from './listUtils';

/* ------------------------------------------------------------------ */
/*  Download helper                                                    */
/* ------------------------------------------------------------------ */

export function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */

export function exportCSV(
  events: WinEvent[],
  columns: ColumnDef[],
  visibleColumns: Set<string>,
  eventLabels: Record<number, string>,
  eventIdColumnKey: string,
  filenamePrefix: string,
): void {
  const cols = columns.filter((c) => visibleColumns.has(c.key));
  const header = cols.map((c) => c.label).join(',');
  const rows = events.map((e) =>
    cols.map((c) => {
      let val = String(c.getValue(e));
      if (c.key === eventIdColumnKey) {
        const label = eventLabels[e.eventId];
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
  triggerDownload(csv, `${filenamePrefix}-${date}.csv`, 'text/csv');
}

/* ------------------------------------------------------------------ */
/*  JSON export                                                        */
/* ------------------------------------------------------------------ */

export function exportJSON(
  events: WinEvent[],
  mapper: (event: WinEvent) => Record<string, unknown>,
  filenamePrefix: string,
): void {
  const data = events.map(mapper);
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(JSON.stringify(data, null, 2), `${filenamePrefix}-${date}.json`, 'application/json');
}
