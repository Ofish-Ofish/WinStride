import type { WinEvent, LogonInfo, GraphNode, GraphEdge } from '../types';

const SYSTEM_ACCOUNTS = new Set([
  'SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE', 'ANONYMOUS LOGON',
  'DefaultAccount', 'WDAGUtilityAccount', 'Guest', '-',
  'DefaultAppPool', 'IUSR', 'sshd', 'krbtgt',
]);

const SYSTEM_ACCOUNT_PATTERNS = [
  /\$$/,              // machine accounts: DESKTOP-01$, SERVER$
  /^DWM-\d+$/,        // Desktop Window Manager: DWM-1, DWM-2, DWM-3
  /^UMFD-\d+$/,       // User Mode Font Driver: UMFD-0, UMFD-1
  /^IUSR/,            // IIS anonymous user
  /^DefaultAppPool/i, // IIS default app pool
  /^\.NET/i,          // .NET runtime accounts (.NETClassic, etc.)
  /^ASPNET/i,         // ASP.NET service accounts
  /^IIS[ _]?APPPOOL/i,// IIS application pool identities
  /^MSSQL/i,          // SQL Server service accounts
  /^SQLServer/i,      // SQL Server accounts
  /^NT SERVICE\\/i,   // NT SERVICE\* accounts
  /^NT AUTHORITY/i,   // NT AUTHORITY accounts
  /^healthmailbox/i,  // Exchange health mailbox
];

export function isSystemAccount(name: string): boolean {
  if (SYSTEM_ACCOUNTS.has(name)) return true;
  return SYSTEM_ACCOUNT_PATTERNS.some((p) => p.test(name));
}

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

// NTSTATUS codes for 4625 failed logon events
export const FAILURE_STATUS_LABELS: Record<string, string> = {
  '0xc0000064': 'User does not exist',
  '0xc000006a': 'Wrong password',
  '0xc0000234': 'Account locked out',
  '0xc0000072': 'Account disabled',
  '0xc000006f': 'Outside allowed hours',
  '0xc0000070': 'Unauthorized workstation',
  '0xc0000071': 'Password expired',
  '0xc0000193': 'Account expired',
  '0xc0000224': 'Password must change',
  '0xc0000225': 'Windows bug (not a risk)',
  '0xc000015b': 'Logon type not granted',
  '0xc000006d': 'Bad username or auth info',
  '0xc000006e': 'Account restriction',
  '0xc0000133': 'Clock out of sync with DC',
  '0xc0000413': 'Auth firewall / policy denied',
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
    const keyLengthStr = getDataField(dataArray, 'KeyLength');
    const elevatedStr = getDataField(dataArray, 'ElevatedToken');

    if (!targetUserName) return null;

    return {
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
      });
    }
    const edge = edgeMap.get(edgeKey)!;
    edge.logonCount++;
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
