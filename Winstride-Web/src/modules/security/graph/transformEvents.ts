import type { WinEvent, LogonInfo, GraphNode, GraphEdge } from '../types';

const PRIVILEGED_USERS = new Set([
  'Administrator',
  'ADMINISTRATOR',
  'admin',
  'ADMIN',
]);

const LOGON_TYPE_LABELS: Record<number, string> = {
  2: 'Interactive',
  3: 'Network',
  4: 'Batch',
  5: 'Service',
  7: 'Unlock',
  8: 'NetCleartext',
  9: 'NewCreds',
  10: 'RDP',
  11: 'Cached',
};

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

function extractLogonInfo(event: WinEvent): LogonInfo | null {
  if (!event.eventData) return null;

  try {
    const parsed = JSON.parse(event.eventData);
    const eventObj = parsed?.Event ?? parsed;
    const eventData = eventObj?.EventData;
    if (!eventData) return null;

    let dataArray = eventData.Data;
    if (!dataArray) return null;

    if (!Array.isArray(dataArray)) {
      dataArray = [dataArray];
    }

    const targetUserName = getDataField(dataArray, 'TargetUserName');
    const logonTypeStr = getDataField(dataArray, 'LogonType');
    const logonType = logonTypeStr ? parseInt(logonTypeStr, 10) : -1;

    if (!targetUserName) return null;

    return {
      targetUserName,
      targetDomainName: getDataField(dataArray, 'TargetDomainName'),
      machineName: event.machineName,
      logonType,
      ipAddress: getDataField(dataArray, 'IpAddress') || '-',
      timeCreated: event.timeCreated,
      eventId: event.eventId,
      subjectUserName: getDataField(dataArray, 'SubjectUserName'),
    };
  } catch {
    return null;
  }
}

export function transformEvents(events: WinEvent[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const logons = events.map(extractLogonInfo).filter(Boolean) as LogonInfo[];

  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  for (const logon of logons) {
    const userId = `user:${logon.targetUserName.toLowerCase()}`;
    const machineId = `machine:${logon.machineName.toLowerCase()}`;

    // Upsert user node
    if (!nodeMap.has(userId)) {
      nodeMap.set(userId, {
        id: userId,
        label: logon.targetUserName,
        type: 'user',
        privileged: PRIVILEGED_USERS.has(logon.targetUserName),
        logonCount: 0,
      });
    }
    nodeMap.get(userId)!.logonCount++;

    // Upsert machine node
    if (!nodeMap.has(machineId)) {
      nodeMap.set(machineId, {
        id: machineId,
        label: logon.machineName,
        type: 'machine',
        privileged: false,
        logonCount: 0,
      });
    }
    nodeMap.get(machineId)!.logonCount++;

    // Edge keyed by user + machine + logonType
    const logonTypeLabel = LOGON_TYPE_LABELS[logon.logonType] ?? `Type ${logon.logonType}`;
    const edgeId = `${userId}->${machineId}::${logon.logonType}`;
    if (!edgeMap.has(edgeId)) {
      edgeMap.set(edgeId, {
        id: edgeId,
        source: userId,
        target: machineId,
        logonCount: 0,
        logonType: logon.logonType,
        logonTypeLabel,
        lastSeen: logon.timeCreated,
      });
    }
    const edge = edgeMap.get(edgeId)!;
    edge.logonCount++;
    if (logon.timeCreated > edge.lastSeen) {
      edge.lastSeen = logon.timeCreated;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}
