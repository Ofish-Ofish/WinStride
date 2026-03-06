import type { ListItem, ColumnDef } from './listUtils';

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

export function exportCSV<T extends ListItem>(
  items: T[],
  columns: ColumnDef<T>[],
  visibleColumns: Set<string>,
  filenamePrefix: string,
  enrichCell?: (col: ColumnDef<T>, item: T) => string | undefined,
): void {
  const cols = columns.filter((c) => visibleColumns.has(c.key));
  const header = cols.map((c) => c.label).join(',');
  const rows = items.map((item) =>
    cols.map((c) => {
      let val = enrichCell?.(c, item) ?? String(c.getValue(item));
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

export function exportJSON<T extends ListItem>(
  items: T[],
  mapper: (item: T) => Record<string, unknown>,
  filenamePrefix: string,
): void {
  const data = items.map(mapper);
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(JSON.stringify(data, null, 2), `${filenamePrefix}-${date}.json`, 'application/json');
}
