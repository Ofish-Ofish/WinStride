import type { WinEvent } from '../../security/shared/types';
import type { ColumnDef } from '../../../shared/listUtils';
import { PS_EVENT_LABELS } from '../shared/eventMeta';
import { parseScriptBlock, parseCommandExecution } from '../shared/parsePSEvent';

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
    key: 'eventId',
    label: 'Event ID',
    defaultVisible: true,
    sortable: true,
    flex: 1.5,
    minWidth: 160,
    getValue: (e) => e.eventId,
    searchKeys: ['event', 'id'],
  },
  {
    key: 'command',
    label: 'Command / Script',
    defaultVisible: true,
    sortable: true,
    flex: 4,
    minWidth: 200,
    getValue: (e) => {
      if (e.eventId === 4104) {
        const sb = parseScriptBlock(e);
        return sb?.scriptBlockText.slice(0, 80) ?? '';
      }
      const cmd = parseCommandExecution(e);
      return cmd?.commandName ?? '';
    },
    searchKeys: ['script', 'cmd', 'code'],
  },
  {
    key: 'path',
    label: 'Path',
    defaultVisible: true,
    sortable: true,
    flex: 2,
    minWidth: 120,
    getValue: (e) => {
      if (e.eventId === 4104) {
        const sb = parseScriptBlock(e);
        return sb?.path ?? '';
      }
      const cmd = parseCommandExecution(e);
      return cmd?.scriptName ?? '';
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
];

/* ------------------------------------------------------------------ */
/*  JSON export mapper                                                 */
/* ------------------------------------------------------------------ */

export function psJsonMapper(e: WinEvent): Record<string, unknown> {
  const sb = parseScriptBlock(e);
  const cmd = parseCommandExecution(e);
  return {
    id: e.id,
    eventId: e.eventId,
    eventLabel: PS_EVENT_LABELS[e.eventId] ?? null,
    level: e.level,
    machineName: e.machineName,
    timeCreated: e.timeCreated,
    command: e.eventId === 4104 ? sb?.scriptBlockText?.slice(0, 200) : cmd?.commandName,
    path: e.eventId === 4104 ? sb?.path : cmd?.scriptName,
  };
}
