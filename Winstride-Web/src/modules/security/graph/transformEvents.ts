import type { WinEvent, LogonInfo, GraphNode, GraphEdge } from '../types';

const PRIVILEGED_USERS = new Set([
  'Administrator',
  'ADMINISTRATOR',
  'admin',
  'ADMIN',
]);

// Human-readable event descriptions
export const EVENT_LABELS: Record<number, string> = {
  4624: 'Logon',
  4625: 'Failed Logon',
  4634: 'Logoff',
  4647: 'User Logoff',
  4648: 'Run As Other User',
  4662: 'Object Access',
  4672: 'Admin Logon',
  4720: 'Account Created',
  4722: 'Account Enabled',
  4723: 'Password Change',
  4724: 'Password Reset',
  4725: 'Account Disabled',
  4726: 'Account Deleted',
  4728: 'Added to Group',
  4732: 'Added to Local Group',
  4733: 'Removed from Group',
  4738: 'Account Changed',
  4740: 'Account Locked Out',
  4756: 'Added to Universal Group',
  4767: 'Account Unlocked',
  4768: 'Kerberos TGT',
  4769: 'Kerberos Service Ticket',
  4776: 'NTLM Auth',
  4798: 'Group Lookup',
  4799: 'Local Group Lookup',
  5379: 'Credential Read',
};

export const LOGON_TYPE_LABELS: Record<number, string> = {
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

function getEdgeLabel(eventId: number, logonType: number): string {
  const base = EVENT_LABELS[eventId] ?? `Event ${eventId}`;
  // Only append logon type for logon/failed logon, not logoff
  if ((eventId === 4624 || eventId === 4625) && logonType >= 0) {
    const lt = LOGON_TYPE_LABELS[logonType];
    if (lt) return `${base} (${lt})`;
  }
  return base;
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

    // Edge keyed by user + machine + eventId + logonType
    const label = getEdgeLabel(logon.eventId, logon.logonType);
    const edgeKey = `${userId}->${machineId}::${logon.eventId}::${logon.logonType}`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, {
        id: edgeKey,
        source: userId,
        target: machineId,
        logonCount: 0,
        logonType: logon.logonType,
        logonTypeLabel: label,
        firstSeen: logon.timeCreated,
        lastSeen: logon.timeCreated,
        ipAddress: logon.ipAddress,
        subjectUserName: logon.subjectUserName,
        targetDomainName: logon.targetDomainName,
      });
    }
    const edge = edgeMap.get(edgeKey)!;
    edge.logonCount++;
    if (logon.timeCreated > edge.lastSeen) {
      edge.lastSeen = logon.timeCreated;
    }
    if (logon.timeCreated < edge.firstSeen) {
      edge.firstSeen = logon.timeCreated;
    }
    // Keep the most recent non-empty IP
    if (logon.ipAddress && logon.ipAddress !== '-') {
      edge.ipAddress = logon.ipAddress;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}
