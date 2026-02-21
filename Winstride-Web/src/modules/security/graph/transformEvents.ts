import type { WinEvent, LogonInfo, GraphNode, GraphEdge } from '../shared/types';
import { EVENT_LABELS, LOGON_TYPE_LABELS, isSystemAccount } from '../shared/eventMeta';
import { getDataField } from '../../../shared/eventParsing';

// Re-export shared symbols so existing consumers don't all break at once
export { EVENT_LABELS, LOGON_TYPE_LABELS, isSystemAccount };
export { FAILURE_STATUS_LABELS } from '../shared/eventMeta';

const PRIVILEGED_USERS = new Set([
  'Administrator',
  'ADMINISTRATOR',
  'admin',
  'ADMIN',
]);

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
    const keyLengthStr = getDataField(dataArray, 'KeyLength');
    const elevatedStr = getDataField(dataArray, 'ElevatedToken');

    if (!targetUserName) return null;

    return {
      id: event.id,
      targetUserName,
      targetDomainName: getDataField(dataArray, 'TargetDomainName'),
      machineName: event.machineName,
      logonType,
      ipAddress: getDataField(dataArray, 'IpAddress') || '-',
      ipPort: getDataField(dataArray, 'IpPort') || '',
      timeCreated: event.timeCreated,
      eventId: event.eventId,
      subjectUserName: getDataField(dataArray, 'SubjectUserName'),
      subjectDomainName: getDataField(dataArray, 'SubjectDomainName'),
      authPackage: getDataField(dataArray, 'AuthenticationPackageName'),
      logonProcess: getDataField(dataArray, 'LogonProcessName'),
      workstationName: getDataField(dataArray, 'WorkstationName'),
      processName: getDataField(dataArray, 'ProcessName'),
      keyLength: keyLengthStr ? parseInt(keyLengthStr, 10) : -1,
      elevatedToken: elevatedStr === '%%1842',
      failureStatus: getDataField(dataArray, 'Status'),
      failureSubStatus: getDataField(dataArray, 'SubStatus'),
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

  const newNode = (id: string, label: string, type: 'user' | 'machine', privileged: boolean): GraphNode => ({
    id, label, type, privileged,
    logonCount: 0, failedCount: 0, successCount: 0, connectedCount: 0,
    authPackages: [], hadAdminSession: false, lastIp: '', lastSeen: '',
  });

  // Track unique connections per node
  const userMachines = new Map<string, Set<string>>();
  const machineUsers = new Map<string, Set<string>>();
  const nodeAuthPackages = new Map<string, Set<string>>();

  for (const logon of logons) {
    const userId = `user:${logon.targetUserName.toLowerCase()}`;
    const machineId = `machine:${logon.machineName.toLowerCase()}`;
    const isFailed = logon.eventId === 4625;

    // Upsert user node
    if (!nodeMap.has(userId)) {
      nodeMap.set(userId, newNode(userId, logon.targetUserName, 'user', PRIVILEGED_USERS.has(logon.targetUserName)));
      userMachines.set(userId, new Set());
      nodeAuthPackages.set(userId, new Set());
    }
    const userNode = nodeMap.get(userId)!;
    userNode.logonCount++;
    if (isFailed) userNode.failedCount++;
    else userNode.successCount++;
    if (logon.elevatedToken) userNode.hadAdminSession = true;
    userMachines.get(userId)!.add(machineId);
    if (logon.authPackage) nodeAuthPackages.get(userId)!.add(logon.authPackage);
    if (logon.ipAddress && logon.ipAddress !== '-' && logon.timeCreated > userNode.lastSeen) {
      userNode.lastIp = logon.ipAddress;
      userNode.lastSeen = logon.timeCreated;
    }

    // Upsert machine node
    if (!nodeMap.has(machineId)) {
      nodeMap.set(machineId, newNode(machineId, logon.machineName, 'machine', false));
      machineUsers.set(machineId, new Set());
      nodeAuthPackages.set(machineId, new Set());
    }
    const machineNode = nodeMap.get(machineId)!;
    machineNode.logonCount++;
    if (isFailed) machineNode.failedCount++;
    else machineNode.successCount++;
    machineUsers.get(machineId)!.add(userId);
    if (logon.authPackage) nodeAuthPackages.get(machineId)!.add(logon.authPackage);
    if (logon.timeCreated > machineNode.lastSeen) {
      machineNode.lastSeen = logon.timeCreated;
    }

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
        ipPort: logon.ipPort,
        subjectUserName: logon.subjectUserName,
        subjectDomainName: logon.subjectDomainName,
        targetDomainName: logon.targetDomainName,
        authPackage: logon.authPackage,
        logonProcess: logon.logonProcess,
        workstationName: logon.workstationName,
        processName: logon.processName,
        keyLength: logon.keyLength,
        elevatedToken: logon.elevatedToken,
        failureStatus: logon.failureStatus,
        failureSubStatus: logon.failureSubStatus,
        eventIds: [],
        isFailed: logon.eventId === 4625,
      });
    }
    const edge = edgeMap.get(edgeKey)!;
    edge.logonCount++;
    edge.eventIds.push(logon.id);
    if (logon.timeCreated > edge.lastSeen) {
      edge.lastSeen = logon.timeCreated;
      // Update fields from most recent event
      if (logon.ipAddress && logon.ipAddress !== '-') edge.ipAddress = logon.ipAddress;
      if (logon.ipPort) edge.ipPort = logon.ipPort;
      if (logon.processName) edge.processName = logon.processName;
      if (logon.workstationName) edge.workstationName = logon.workstationName;
      if (logon.elevatedToken) edge.elevatedToken = true;
    }
    if (logon.timeCreated < edge.firstSeen) {
      edge.firstSeen = logon.timeCreated;
    }
  }

  // Finalize node stats
  for (const [id, node] of nodeMap) {
    if (node.type === 'user') {
      node.connectedCount = userMachines.get(id)?.size ?? 0;
    } else {
      node.connectedCount = machineUsers.get(id)?.size ?? 0;
    }
    node.authPackages = Array.from(nodeAuthPackages.get(id) ?? []);
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}
