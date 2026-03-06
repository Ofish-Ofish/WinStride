import type { ColumnDef } from '../../../shared/listUtils';
import type { Heartbeat } from '../shared/types';

export const COLUMNS: ColumnDef<Heartbeat>[] = [
  {
    key: 'machine',
    label: 'Machine',
    defaultVisible: true,
    sortable: true,
    flex: 2,
    minWidth: 140,
    getValue: (h) => h.machineName,
    searchKeys: ['host', 'name'],
  },
  {
    key: 'status',
    label: 'Status',
    defaultVisible: true,
    sortable: true,
    flex: 1,
    minWidth: 100,
    getValue: (h) => {
      if (!h.isAlive) return 'Offline';
      const age = Date.now() - new Date(h.lastSeen).getTime();
      return age > 5 * 60_000 ? 'Stale' : 'Online';
    },
  },
  {
    key: 'time',
    label: 'Last Seen',
    defaultVisible: true,
    sortable: true,
    flex: 1.5,
    minWidth: 120,
    getValue: (h) => h.lastSeen,
  },
];

export function heartbeatsJsonMapper(h: Heartbeat): Record<string, unknown> {
  return {
    id: h.id,
    machineName: h.machineName,
    isAlive: h.isAlive,
    lastSeen: h.lastSeen,
  };
}
