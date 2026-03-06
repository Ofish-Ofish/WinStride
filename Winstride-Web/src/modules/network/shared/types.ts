export interface NetworkConnection {
  id: number;
  machineName: string;
  processName: string | null;
  processId: number | null;
  batchId: string;
  protocol: string | null;
  localAddress: string | null;
  localPort: number | null;
  remoteAddress: string | null;
  remotePort: number | null;
  state: string | null;
  moduleName: string | null;
  sentPackets: number;
  recvPackets: number;
  sentBytes: number;
  recvBytes: number;
  timeCreated: string;
}
