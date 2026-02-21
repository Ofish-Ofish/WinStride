export interface WinEvent {
  id: number;
  eventId: number;
  logName: string;
  machineName: string;
  level: string | null;
  timeCreated: string;
  eventData: string | null;
}

export interface LogonInfo {
  id: number;
  targetUserName: string;
  targetDomainName: string;
  machineName: string;
  logonType: number;
  ipAddress: string;
  ipPort: string;
  timeCreated: string;
  eventId: number;
  subjectUserName: string;
  subjectDomainName: string;
  authPackage: string;
  logonProcess: string;
  workstationName: string;
  processName: string;
  keyLength: number;
  elevatedToken: boolean;
  failureStatus: string;
  failureSubStatus: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'user' | 'machine';
  privileged: boolean;
  logonCount: number;
  failedCount: number;
  successCount: number;
  connectedCount: number;
  authPackages: string[];
  hadAdminSession: boolean;
  lastIp: string;
  lastSeen: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  logonCount: number;
  logonType: number;
  logonTypeLabel: string;
  firstSeen: string;
  lastSeen: string;
  ipAddress: string;
  ipPort: string;
  subjectUserName: string;
  subjectDomainName: string;
  targetDomainName: string;
  authPackage: string;
  logonProcess: string;
  workstationName: string;
  processName: string;
  keyLength: number;
  elevatedToken: boolean;
  failureStatus: string;
  failureSubStatus: string;
  eventIds: number[];
  isFailed: boolean;
}
