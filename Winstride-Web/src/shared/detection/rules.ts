import type { WinEvent } from '../../modules/security/shared/types';
import { getDataField, getDataArray } from '../eventParsing';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type Module = 'sysmon' | 'powershell' | 'security';

export interface DetectionRule {
  id: string;
  name: string;
  severity: Severity;
  module: Module;
  mitre?: string;
  description: string;
  /** Return true if a single event matches this rule. */
  match: (event: WinEvent) => boolean;
}

/**
 * Multi-event rules inspect the entire event array (e.g. brute force).
 * They return event IDs that triggered the detection.
 */
export interface MultiEventRule {
  id: string;
  name: string;
  severity: Severity;
  module: Module;
  mitre?: string;
  description: string;
  /** Return a Set of event.id values that should be flagged. */
  matchAll: (events: WinEvent[]) => Set<number>;
}

export interface Detection {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  mitre?: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function field(event: WinEvent, name: string): string {
  const arr = getDataArray(event);
  if (!arr) return '';
  return getDataField(arr, name);
}

function lower(event: WinEvent, name: string): string {
  return field(event, name).toLowerCase();
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

/* ------------------------------------------------------------------ */
/*  Sysmon Rules                                                       */
/* ------------------------------------------------------------------ */

const OFFICE_PROCESSES = new Set([
  'winword.exe', 'excel.exe', 'powerpnt.exe', 'outlook.exe',
  'msaccess.exe', 'mspub.exe', 'onenote.exe',
]);

const SHELLS = new Set(['cmd.exe', 'powershell.exe', 'pwsh.exe', 'wscript.exe', 'cscript.exe', 'mshta.exe']);

const LOLBAS = new Set([
  'certutil.exe', 'bitsadmin.exe', 'mshta.exe', 'regsvr32.exe',
  'rundll32.exe', 'msiexec.exe', 'cmstp.exe', 'installutil.exe',
  'regasm.exe', 'regsvcs.exe', 'msconfig.exe', 'msbuild.exe',
  'wmic.exe', 'forfiles.exe', 'pcalua.exe', 'csc.exe',
]);

const SUSPICIOUS_PORTS = new Set([4444, 5555, 6666, 8888, 1234, 9999, 31337, 12345, 4443, 1337]);

const STARTUP_PATHS = [
  'startup', 'start menu\\programs\\startup',
  'appdata\\roaming\\microsoft\\windows\\start menu',
];

const SUSPICIOUS_DIRS = [
  '\\temp\\', '\\tmp\\', '\\public\\', '\\perflogs\\',
  '\\appdata\\local\\temp\\', '\\windows\\temp\\',
  '\\recycler\\', '$recycle.bin',
];

export const sysmonRules: DetectionRule[] = [
  // --- Process creation (Event 1) ---
  {
    id: 'SYS-001',
    name: 'Office app spawned shell',
    severity: 'high',
    module: 'sysmon',
    mitre: 'T1204.002',
    description: 'An Office application spawned a command shell — possible macro execution',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const parent = basename(lower(e, 'ParentImage'));
      const child = basename(lower(e, 'Image'));
      return OFFICE_PROCESSES.has(parent) && SHELLS.has(child);
    },
  },
  {
    id: 'SYS-002',
    name: 'LOLBAS execution',
    severity: 'medium',
    module: 'sysmon',
    mitre: 'T1218',
    description: 'A Living Off the Land binary was executed — commonly abused for defense evasion',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const img = basename(lower(e, 'Image'));
      return LOLBAS.has(img);
    },
  },
  {
    id: 'SYS-003',
    name: 'Process from suspicious directory',
    severity: 'medium',
    module: 'sysmon',
    mitre: 'T1036',
    description: 'A process was started from a suspicious directory (Temp, Recycle Bin, etc.)',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const image = lower(e, 'Image');
      return SUSPICIOUS_DIRS.some((d) => image.includes(d));
    },
  },
  {
    id: 'SYS-004',
    name: 'PowerShell encoded command',
    severity: 'high',
    module: 'sysmon',
    mitre: 'T1059.001',
    description: 'PowerShell was launched with an encoded command — common evasion technique',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const img = basename(lower(e, 'Image'));
      if (img !== 'powershell.exe' && img !== 'pwsh.exe') return false;
      const cmdLine = lower(e, 'CommandLine');
      return cmdLine.includes('-enc') || cmdLine.includes('-encodedcommand') || cmdLine.includes('frombase64string');
    },
  },
  {
    id: 'SYS-005',
    name: 'Shell spawned by web server',
    severity: 'critical',
    module: 'sysmon',
    mitre: 'T1505.003',
    description: 'A web server process spawned a shell — possible webshell or RCE',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const parent = basename(lower(e, 'ParentImage'));
      const child = basename(lower(e, 'Image'));
      const webProcs = new Set(['w3wp.exe', 'httpd.exe', 'nginx.exe', 'tomcat.exe', 'java.exe', 'node.exe', 'php-cgi.exe']);
      return webProcs.has(parent) && SHELLS.has(child);
    },
  },
  {
    id: 'SYS-006',
    name: 'Credential dumping tool',
    severity: 'critical',
    module: 'sysmon',
    mitre: 'T1003',
    description: 'A known credential dumping tool was detected',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const cmdLine = lower(e, 'CommandLine');
      const image = lower(e, 'Image');
      const tools = ['mimikatz', 'procdump', 'lazagne', 'secretsdump', 'pypykatz', 'nanodump'];
      return tools.some((t) => cmdLine.includes(t) || image.includes(t));
    },
  },
  {
    id: 'SYS-007',
    name: 'Suspicious PowerShell download',
    severity: 'high',
    module: 'sysmon',
    mitre: 'T1105',
    description: 'PowerShell launched with download cradle arguments',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const img = basename(lower(e, 'Image'));
      if (img !== 'powershell.exe' && img !== 'pwsh.exe') return false;
      const cmdLine = lower(e, 'CommandLine');
      const indicators = ['downloadstring', 'downloadfile', 'invoke-webrequest', 'start-bitstransfer', 'wget', 'curl', 'net.webclient'];
      return indicators.some((i) => cmdLine.includes(i));
    },
  },
  {
    id: 'SYS-008',
    name: 'Process created with System integrity',
    severity: 'info',
    module: 'sysmon',
    mitre: 'T1134',
    description: 'A process was created with System-level integrity',
    match: (e) => {
      if (e.eventId !== 1) return false;
      return field(e, 'IntegrityLevel') === 'System';
    },
  },
  {
    id: 'SYS-009',
    name: 'PsExec or remote execution tool',
    severity: 'high',
    module: 'sysmon',
    mitre: 'T1570',
    description: 'A known remote execution tool was detected',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const image = lower(e, 'Image');
      const cmdLine = lower(e, 'CommandLine');
      const tools = ['psexec', 'paexec', 'remcom', 'csexec', 'winexe'];
      return tools.some((t) => image.includes(t) || cmdLine.includes(t));
    },
  },
  {
    id: 'SYS-010',
    name: 'Scheduled task creation via CLI',
    severity: 'medium',
    module: 'sysmon',
    mitre: 'T1053.005',
    description: 'A scheduled task was created via command line — possible persistence',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const img = basename(lower(e, 'Image'));
      const cmdLine = lower(e, 'CommandLine');
      return img === 'schtasks.exe' && cmdLine.includes('/create');
    },
  },
  {
    id: 'SYS-011',
    name: 'Registry run key modification',
    severity: 'medium',
    module: 'sysmon',
    mitre: 'T1547.001',
    description: 'A command modified a registry run key — possible persistence',
    match: (e) => {
      if (e.eventId !== 1) return false;
      const cmdLine = lower(e, 'CommandLine');
      return (cmdLine.includes('reg') && cmdLine.includes('add') &&
        (cmdLine.includes('\\run') || cmdLine.includes('\\runonce')));
    },
  },

  // --- Network (Event 3) ---
  {
    id: 'SYS-012',
    name: 'Connection to suspicious port',
    severity: 'medium',
    module: 'sysmon',
    mitre: 'T1571',
    description: 'A process connected to a commonly abused port',
    match: (e) => {
      if (e.eventId !== 3) return false;
      const port = parseInt(field(e, 'DestinationPort') || '0', 10);
      return SUSPICIOUS_PORTS.has(port);
    },
  },
  {
    id: 'SYS-013',
    name: 'Shell process made network connection',
    severity: 'high',
    module: 'sysmon',
    mitre: 'T1059',
    description: 'A command shell made an outbound network connection — possible reverse shell',
    match: (e) => {
      if (e.eventId !== 3) return false;
      const img = basename(lower(e, 'Image'));
      return SHELLS.has(img);
    },
  },
  {
    id: 'SYS-014',
    name: 'LOLBAS made network connection',
    severity: 'high',
    module: 'sysmon',
    mitre: 'T1105',
    description: 'A LOLBAS binary made an outbound network connection',
    match: (e) => {
      if (e.eventId !== 3) return false;
      const img = basename(lower(e, 'Image'));
      return LOLBAS.has(img);
    },
  },

  // --- File creation (Event 11) ---
  {
    id: 'SYS-015',
    name: 'File dropped in startup folder',
    severity: 'high',
    module: 'sysmon',
    mitre: 'T1547.001',
    description: 'A file was created in a startup folder — possible persistence',
    match: (e) => {
      if (e.eventId !== 11) return false;
      const target = lower(e, 'TargetFilename');
      return STARTUP_PATHS.some((p) => target.includes(p));
    },
  },
  // --- Broad classifiers (catch common events) ---
  {
    id: 'SYS-017',
    name: 'Network connection',
    severity: 'info',
    module: 'sysmon',
    description: 'A process made an outbound network connection',
    match: (e) => e.eventId === 3,
  },
  {
    id: 'SYS-018',
    name: 'File created',
    severity: 'info',
    module: 'sysmon',
    description: 'A file was created on disk',
    match: (e) => e.eventId === 11,
  },
  {
    id: 'SYS-019',
    name: 'High integrity process',
    severity: 'low',
    module: 'sysmon',
    description: 'A process was created with elevated (High) integrity',
    match: (e) => {
      if (e.eventId !== 1) return false;
      return field(e, 'IntegrityLevel') === 'High';
    },
  },
  {
    id: 'SYS-020',
    name: 'Process created',
    severity: 'info',
    module: 'sysmon',
    description: 'A new process was created',
    match: (e) => e.eventId === 1,
  },
  {
    id: 'SYS-016',
    name: 'Executable dropped in temp',
    severity: 'medium',
    module: 'sysmon',
    mitre: 'T1105',
    description: 'An executable was dropped in a temp directory',
    match: (e) => {
      if (e.eventId !== 11) return false;
      const target = lower(e, 'TargetFilename');
      const isTemp = target.includes('\\temp\\') || target.includes('\\tmp\\');
      const isExe = target.endsWith('.exe') || target.endsWith('.dll') || target.endsWith('.scr') || target.endsWith('.bat') || target.endsWith('.ps1');
      return isTemp && isExe;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  PowerShell Rules                                                   */
/* ------------------------------------------------------------------ */

export const powershellRules: DetectionRule[] = [
  {
    id: 'PS-001',
    name: 'Encoded command execution',
    severity: 'high',
    module: 'powershell',
    mitre: 'T1059.001',
    description: 'A script block contains Base64 encoded command patterns',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      return text.includes('frombase64string') || text.includes('encodedcommand');
    },
  },
  {
    id: 'PS-002',
    name: 'Download cradle',
    severity: 'high',
    module: 'powershell',
    mitre: 'T1105',
    description: 'A script block contains a download cradle pattern',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      const indicators = ['downloadstring', 'downloadfile', 'invoke-webrequest', 'start-bitstransfer', 'net.webclient', 'bitstransfer'];
      return indicators.some((i) => text.includes(i));
    },
  },
  {
    id: 'PS-003',
    name: 'AMSI bypass attempt',
    severity: 'critical',
    module: 'powershell',
    mitre: 'T1562.001',
    description: 'A script block attempts to bypass AMSI (Anti-Malware Scan Interface)',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      return (text.includes('amsi') && (text.includes('bypass') || text.includes('disable') || text.includes('utils')))
        || text.includes('amsiinitfailed');
    },
  },
  {
    id: 'PS-004',
    name: 'Credential theft tool',
    severity: 'critical',
    module: 'powershell',
    mitre: 'T1003',
    description: 'A script block references a known credential theft tool',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      const tools = ['invoke-mimikatz', 'invoke-kerberoast', 'invoke-rubeus', 'invoke-bloodhound', 'invoke-sharphound',
        'get-gpppassword', 'invoke-dcsync', 'invoke-lsasstokens'];
      return tools.some((t) => text.includes(t));
    },
  },
  {
    id: 'PS-005',
    name: 'Process injection APIs',
    severity: 'critical',
    module: 'powershell',
    mitre: 'T1055',
    description: 'A script block references memory/injection APIs',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      const apis = ['virtualalloc', 'createthread', 'writeprocessmemory', 'createremotethread',
        'ntcreatethread', 'virtualprotect', 'rtlmovememory'];
      return apis.some((a) => text.includes(a));
    },
  },
  {
    id: 'PS-006',
    name: 'Reflection/Assembly loading',
    severity: 'medium',
    module: 'powershell',
    mitre: 'T1620',
    description: 'A script block loads .NET assemblies reflectively — common in offensive tools',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      return (text.includes('reflection.assembly') && text.includes('load'))
        || text.includes('[system.reflection.assembly]::load');
    },
  },
  {
    id: 'PS-007',
    name: 'Invoke-Expression usage',
    severity: 'medium',
    module: 'powershell',
    mitre: 'T1059.001',
    description: 'A script block uses Invoke-Expression — often used to execute dynamic/obfuscated code',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      return text.includes('invoke-expression') || /\biex\b/.test(text);
    },
  },
  {
    id: 'PS-008',
    name: 'Defender exclusion/disable',
    severity: 'high',
    module: 'powershell',
    mitre: 'T1562.001',
    description: 'A script block modifies Windows Defender settings',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      return text.includes('set-mppreference') && (
        text.includes('disablerealtimemonitoring') || text.includes('exclusionpath')
        || text.includes('exclusionextension') || text.includes('exclusionprocess')
      );
    },
  },
  {
    id: 'PS-009',
    name: 'Reconnaissance commands',
    severity: 'low',
    module: 'powershell',
    mitre: 'T1087',
    description: 'A script block runs common reconnaissance commands',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = lower(e, 'ScriptBlockText');
      const cmds = ['get-aduser', 'get-adcomputer', 'get-adgroup', 'get-addomaincontroller',
        'get-netlocalgroup', 'get-netuser', 'get-netsession', 'get-netshare'];
      return cmds.some((c) => text.includes(c));
    },
  },
  {
    id: 'PS-010',
    name: 'Suspicious string obfuscation',
    severity: 'medium',
    module: 'powershell',
    mitre: 'T1027',
    description: 'A script block contains obfuscation patterns (char codes, string joining, tick insertion)',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      const text = field(e, 'ScriptBlockText');
      // [char] casts — more than 3 in one block is suspicious
      const charCount = (text.match(/\[char\]\s*\d+/gi) || []).length;
      if (charCount >= 4) return true;
      // -join with char array
      if (/\(\s*\[char\[\]\].*-join/i.test(text)) return true;
      // Excessive backtick obfuscation (e.g. I`nv`oke-Ex`pression)
      const tickSegments = text.split('`').length - 1;
      if (tickSegments >= 6) return true;
      return false;
    },
  },
  {
    id: 'PS-011',
    name: 'Suspicious command in host application',
    severity: 'medium',
    module: 'powershell',
    mitre: 'T1059.001',
    description: 'A command was executed with suspicious host application flags',
    match: (e) => {
      if (e.eventId !== 4103) return false;
      const arr = getDataArray(e);
      if (!arr) return false;
      const contextInfo = getDataField(arr, 'ContextInfo').toLowerCase();
      return contextInfo.includes('-nop') && (contextInfo.includes('-w hidden') || contextInfo.includes('-windowstyle hidden'));
    },
  },
  {
    id: 'PS-012',
    name: 'Script block flagged as suspicious by AMSI',
    severity: 'high',
    module: 'powershell',
    mitre: 'T1059.001',
    description: 'Windows AMSI flagged this script block as suspicious (Warning level)',
    match: (e) => {
      if (e.eventId !== 4104) return false;
      return e.level === 'Warning';
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Security Rules                                                     */
/* ------------------------------------------------------------------ */

export const securityRules: DetectionRule[] = [
  {
    id: 'SEC-001',
    name: 'Cleartext authentication',
    severity: 'high',
    module: 'security',
    mitre: 'T1110',
    description: 'Network cleartext logon (type 8) — credentials sent unencrypted',
    match: (e) => {
      if (e.eventId !== 4624) return false;
      const logonType = parseInt(field(e, 'LogonType') || '0', 10);
      return logonType === 8;
    },
  },
  {
    id: 'SEC-002',
    name: 'Pass-the-Hash indicators',
    severity: 'critical',
    module: 'security',
    mitre: 'T1550.002',
    description: 'NewCredentials logon (type 9) with NTLM — consistent with Pass-the-Hash',
    match: (e) => {
      if (e.eventId !== 4624) return false;
      const logonType = parseInt(field(e, 'LogonType') || '0', 10);
      const authPkg = lower(e, 'AuthenticationPackageName');
      return logonType === 9 && authPkg.includes('ntlm');
    },
  },
  {
    id: 'SEC-003',
    name: 'Account created',
    severity: 'medium',
    module: 'security',
    mitre: 'T1136.001',
    description: 'A new user account was created',
    match: (e) => e.eventId === 4720,
  },
  {
    id: 'SEC-004',
    name: 'Account deleted',
    severity: 'medium',
    module: 'security',
    mitre: 'T1531',
    description: 'A user account was deleted',
    match: (e) => e.eventId === 4726,
  },
  {
    id: 'SEC-005',
    name: 'User added to privileged group',
    severity: 'high',
    module: 'security',
    mitre: 'T1098',
    description: 'A user was added to a security group (Domain Admins, Administrators, etc.)',
    match: (e) => {
      return e.eventId === 4728 || e.eventId === 4732 || e.eventId === 4756;
    },
  },
  {
    id: 'SEC-006',
    name: 'Account locked out',
    severity: 'medium',
    module: 'security',
    mitre: 'T1110',
    description: 'An account was locked out — may indicate brute-force attempt',
    match: (e) => e.eventId === 4740,
  },
  {
    id: 'SEC-007',
    name: 'Explicit credential use (RunAs)',
    severity: 'low',
    module: 'security',
    mitre: 'T1078',
    description: 'Explicit credentials were used to run a process (RunAs)',
    match: (e) => e.eventId === 4648,
  },
  {
    id: 'SEC-008',
    name: 'Failed logon — bad password',
    severity: 'low',
    module: 'security',
    description: 'A logon attempt failed due to incorrect password',
    match: (e) => {
      if (e.eventId !== 4625) return false;
      const status = lower(e, 'SubStatus') || lower(e, 'Status');
      return status === '0xc000006a';
    },
  },
  {
    id: 'SEC-009',
    name: 'Failed logon — user not found',
    severity: 'medium',
    module: 'security',
    mitre: 'T1110.001',
    description: 'A logon attempt failed for a nonexistent user — possible user enumeration',
    match: (e) => {
      if (e.eventId !== 4625) return false;
      const status = lower(e, 'SubStatus') || lower(e, 'Status');
      return status === '0xc0000064';
    },
  },
  {
    id: 'SEC-010',
    name: 'Kerberos TGT request with RC4',
    severity: 'high',
    module: 'security',
    mitre: 'T1558.003',
    description: 'A Kerberos TGT was requested with RC4 encryption — possible Kerberoasting',
    match: (e) => {
      if (e.eventId !== 4768 && e.eventId !== 4769) return false;
      const ticketEncryption = lower(e, 'TicketEncryptionType');
      // 0x17 = RC4_HMAC_MD5
      return ticketEncryption === '0x17';
    },
  },
  {
    id: 'SEC-011',
    name: 'NTLM authentication used',
    severity: 'info',
    module: 'security',
    description: 'NTLM was used for authentication instead of Kerberos',
    match: (e) => {
      if (e.eventId !== 4624) return false;
      const authPkg = lower(e, 'AuthenticationPackageName');
      return authPkg.includes('ntlm');
    },
  },
  {
    id: 'SEC-012',
    name: 'Credential access',
    severity: 'medium',
    module: 'security',
    mitre: 'T1555',
    description: 'A credential was read from the credential store',
    match: (e) => e.eventId === 5379,
  },
  // --- Broad classifiers (catch common events) ---
  {
    id: 'SEC-013',
    name: 'Failed logon',
    severity: 'low',
    module: 'security',
    description: 'A logon attempt failed',
    match: (e) => e.eventId === 4625,
  },
  {
    id: 'SEC-014',
    name: 'Admin session',
    severity: 'low',
    module: 'security',
    description: 'An administrative/elevated logon session was created',
    match: (e) => e.eventId === 4672,
  },
  {
    id: 'SEC-015',
    name: 'RDP logon',
    severity: 'info',
    module: 'security',
    description: 'A Remote Desktop (type 10) logon was detected',
    match: (e) => {
      if (e.eventId !== 4624) return false;
      const logonType = parseInt(field(e, 'LogonType') || '0', 10);
      return logonType === 10;
    },
  },
  {
    id: 'SEC-016',
    name: 'Network logon',
    severity: 'info',
    module: 'security',
    description: 'A network logon (type 3) was detected — file share, printing, etc.',
    match: (e) => {
      if (e.eventId !== 4624) return false;
      const logonType = parseInt(field(e, 'LogonType') || '0', 10);
      return logonType === 3;
    },
  },
  {
    id: 'SEC-017',
    name: 'Account management',
    severity: 'low',
    module: 'security',
    description: 'An account management operation was performed',
    match: (e) => {
      return [4722, 4723, 4724, 4725, 4738, 4767].includes(e.eventId);
    },
  },
  {
    id: 'SEC-018',
    name: 'Interactive logon',
    severity: 'info',
    module: 'security',
    description: 'An interactive (type 2) or unlock (type 7) logon was detected',
    match: (e) => {
      if (e.eventId !== 4624) return false;
      const logonType = parseInt(field(e, 'LogonType') || '0', 10);
      return logonType === 2 || logonType === 7;
    },
  },
  {
    id: 'SEC-019',
    name: 'Service logon',
    severity: 'info',
    module: 'security',
    description: 'A service (type 5) logon was detected',
    match: (e) => {
      if (e.eventId !== 4624) return false;
      const logonType = parseInt(field(e, 'LogonType') || '0', 10);
      return logonType === 5;
    },
  },
  {
    id: 'SEC-020',
    name: 'Logon event',
    severity: 'info',
    module: 'security',
    description: 'A successful logon was recorded',
    match: (e) => e.eventId === 4624,
  },
];

/* ------------------------------------------------------------------ */
/*  Multi-event rules                                                  */
/* ------------------------------------------------------------------ */

const BRUTE_FORCE_THRESHOLD = 5;
const BRUTE_FORCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export const multiEventRules: MultiEventRule[] = [
  {
    id: 'SEC-M01',
    name: 'Brute force detected',
    severity: 'critical',
    module: 'security',
    mitre: 'T1110',
    description: `${BRUTE_FORCE_THRESHOLD}+ failed logons for the same account within 5 minutes`,
    matchAll: (events) => {
      const flagged = new Set<number>();
      // Group failed logons by target user
      const byUser = new Map<string, WinEvent[]>();
      for (const e of events) {
        if (e.eventId !== 4625) continue;
        const user = lower(e, 'TargetUserName');
        if (!user) continue;
        let arr = byUser.get(user);
        if (!arr) { arr = []; byUser.set(user, arr); }
        arr.push(e);
      }
      for (const userEvents of byUser.values()) {
        if (userEvents.length < BRUTE_FORCE_THRESHOLD) continue;
        // Sort by time, sliding window
        const sorted = userEvents.sort((a, b) => new Date(a.timeCreated).getTime() - new Date(b.timeCreated).getTime());
        for (let i = 0; i <= sorted.length - BRUTE_FORCE_THRESHOLD; i++) {
          const windowEnd = new Date(sorted[i].timeCreated).getTime() + BRUTE_FORCE_WINDOW_MS;
          let count = 0;
          for (let j = i; j < sorted.length && new Date(sorted[j].timeCreated).getTime() <= windowEnd; j++) {
            count++;
          }
          if (count >= BRUTE_FORCE_THRESHOLD) {
            // Flag all events in this window
            const start = new Date(sorted[i].timeCreated).getTime();
            for (const ev of sorted) {
              const t = new Date(ev.timeCreated).getTime();
              if (t >= start && t <= windowEnd) flagged.add(ev.id);
            }
            break; // one detection per user is enough
          }
        }
      }
      return flagged;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  All rules by module                                                */
/* ------------------------------------------------------------------ */

export const ALL_RULES: DetectionRule[] = [...sysmonRules, ...powershellRules, ...securityRules];

export function getRulesForModule(module: Module): DetectionRule[] {
  return ALL_RULES.filter((r) => r.module === module);
}

export function getMultiEventRulesForModule(module: Module): MultiEventRule[] {
  return multiEventRules.filter((r) => r.module === module);
}
