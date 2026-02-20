import type { WinEvent } from '../shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { getDataField } from '../../../shared/eventParsing';
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
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  JSON export mapper                                                 */
/* ------------------------------------------------------------------ */

export function securityJsonMapper(e: WinEvent): Record<string, unknown> {
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
}
