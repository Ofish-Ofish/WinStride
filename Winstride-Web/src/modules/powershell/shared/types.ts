import type { WinEvent } from '../../security/shared/types';

export interface PSEnrichedEvent extends WinEvent {
  correlatedPid: number | null;
  correlatedProcessName: string;
  correlatedProcessPath: string;
  correlatedUser: string;
  correlatedHostApplication: string;
  correlatedCommandLine: string;
  correlatedParentImage: string;
  correlatedLogonId: string;
  correlatedSysmonTime: string;
  correlationSource: 'none' | 'powershell' | 'sysmon' | 'powershell+sysmon';
}
