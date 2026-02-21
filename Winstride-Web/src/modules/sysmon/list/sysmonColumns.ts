import type { ColumnDef } from '../../../shared/listUtils';
import type { WinEvent } from '../../security/shared/types';
import { SYSMON_EVENT_LABELS } from '../shared/eventMeta';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

export const COLUMNS: ColumnDef[] = [
  {
    key: 'severity',
    label: 'Risk',
    defaultVisible: true,
    sortable: true,
    flex: 0.7,
    minWidth: 60,
    getValue: (e) => e.id,
    searchKeys: ['risk'],
  },
  {
    key: 'type',
    label: 'Type',
    defaultVisible: true,
    sortable: true,
    flex: 1.5,
    minWidth: 150,
    getValue: (e) => e.eventId,
    searchKeys: ['event', 'eventid'],
  },
  {
    key: 'process',
    label: 'Process',
    defaultVisible: true,
    sortable: true,
    flex: 2,
    minWidth: 130,
    getValue: getProcessName,
    searchKeys: ['image'],
  },
  {
    key: 'detail',
    label: 'Detail',
    defaultVisible: true,
    sortable: true,
    flex: 4,
    minWidth: 200,
    getValue: getDetail,
    searchKeys: ['command', 'cmd', 'commandline'],
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
    searchKeys: ['host'],
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

/* ------------------------------------------------------------------ */
/*  JSON export mapper                                                 */
/* ------------------------------------------------------------------ */

export function sysmonJsonMapper(e: WinEvent): Record<string, unknown> {
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
}
