export const PS_EVENT_LABELS: Record<number, string> = {
  4103: 'Command Execution',
  4104: 'Script Block',
};

export const PS_EVENT_IDS = Object.keys(PS_EVENT_LABELS).map(Number);

// Suspicious keywords to highlight in script blocks (from MITRE ATT&CK T1059.001)
export const SUSPICIOUS_KEYWORDS = [
  'Invoke-Expression', 'IEX', 'Invoke-Command',
  'Net.WebClient', 'DownloadString', 'DownloadFile',
  'FromBase64String', 'EncodedCommand',
  'Invoke-Mimikatz', 'Invoke-WebRequest',
  'VirtualAlloc', 'CreateThread',
  'System.Runtime.InteropServices',
  'Add-Type', 'Reflection.Assembly',
  'Set-MpPreference', 'DisableRealtimeMonitoring',
  'AMSI', 'Bypass',
];
