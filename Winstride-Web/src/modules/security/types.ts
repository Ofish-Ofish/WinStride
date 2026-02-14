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
  targetUserName: string;
  targetDomainName: string;
  machineName: string;
  logonType: number;
  ipAddress: string;
  timeCreated: string;
  eventId: number;
  subjectUserName: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'user' | 'machine';
  privileged: boolean;
  logonCount: number;
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
  subjectUserName: string;
  targetDomainName: string;
}
