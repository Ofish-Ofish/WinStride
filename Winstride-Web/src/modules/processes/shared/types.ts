export interface WinProcess {
  id: number;
  machineName: string;
  batchId: string;
  timeSynced: string;
  imageName: string;
  pid: number;
  parentPid: number | null;
  sessionId: number;
  workingSetSize: number;
  path: string | null;
  verificationStatus: string | null;
}
