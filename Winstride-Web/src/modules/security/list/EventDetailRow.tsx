import { useState } from 'react';
import type { WinEvent } from '../shared/types';
import { LOGON_TYPE_LABELS, FAILURE_STATUS_LABELS } from '../shared/eventMeta';
import { parseEventData } from './listColumns';

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-[#21262d]/60">
      <span className="text-[11px] text-gray-200 uppercase tracking-wider shrink-0 mr-4">{label}</span>
      <span className="text-[12px] text-white font-mono text-right break-all">{value}</span>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: `${color}20`, color }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-[#58a6ff] uppercase tracking-widest mt-3 mb-1 font-semibold">{children}</div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatProcessName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function getFailureReason(status: string, subStatus: string): string | null {
  return FAILURE_STATUS_LABELS[subStatus?.toLowerCase()]
    ?? FAILURE_STATUS_LABELS[status?.toLowerCase()]
    ?? null;
}

/** Human-readable labels for common Windows event data field names */
const FIELD_LABELS: Record<string, string> = {
  TargetUserSid: 'Target SID',
  SubjectUserSid: 'Subject SID',
  SubjectLogonId: 'Subject Logon ID',
  TargetLogonId: 'Target Logon ID',
  TargetLinkedLogonId: 'Linked Logon ID',
  TargetLogonGuid: 'Logon GUID',
  LogonGuid: 'Logon GUID',
  TransmittedServices: 'Transmitted Services',
  LmPackageName: 'NTLM Version',
  VirtualAccount: 'Virtual Account',
  TargetOutboundUserName: 'Outbound User',
  TargetOutboundDomainName: 'Outbound Domain',
  RestrictedAdminMode: 'Restricted Admin',
  PrivilegeList: 'Privileges',
  MemberName: 'Member',
  MemberSid: 'Member SID',
  TargetSid: 'Target SID',
  SamAccountName: 'SAM Account',
  DisplayName: 'Display Name',
  UserPrincipalName: 'UPN',
  HomeDirectory: 'Home Directory',
  HomePath: 'Home Path',
  ScriptPath: 'Script Path',
  ProfilePath: 'Profile Path',
  UserWorkstations: 'Allowed Workstations',
  PasswordLastSet: 'Password Last Set',
  AccountExpires: 'Account Expires',
  PrimaryGroupId: 'Primary Group ID',
  AllowedToDelegateTo: 'Delegate To',
  OldUacValue: 'Old UAC',
  NewUacValue: 'New UAC',
  UserAccountControl: 'Account Control',
  SidHistory: 'SID History',
  LogonHours: 'Logon Hours',
  ServiceName: 'Service Name',
  ServiceSid: 'Service SID',
  TicketEncryptionType: 'Encryption Type',
  TicketOptions: 'Ticket Options',
  PreAuthType: 'Pre-Auth Type',
  CertIssuerName: 'Cert Issuer',
  CertSerialNumber: 'Cert Serial',
  CertThumbprint: 'Cert Thumbprint',
  ImpersonationLevel: 'Impersonation',
  PackageName: 'Package',
  CallerProcessId: 'Caller PID',
  CallerProcessName: 'Caller Process',
};

/** Fields already shown in the structured sections — skip in "Additional" */
const STRUCTURED_FIELDS = new Set([
  'TargetUserName', 'TargetDomainName',
  'SubjectUserName', 'SubjectDomainName',
  'LogonType', 'ElevatedToken',
  'IpAddress', 'IpPort', 'WorkstationName',
  'AuthenticationPackageName', 'LogonProcessName',
  'ProcessName', 'KeyLength',
  'Status', 'SubStatus',
]);

/** Values that are effectively empty */
const EMPTY_VALUES = new Set(['-', '%%1843', '%%1842', '0', '-1', '0x0', '']);

/** Extract all named fields from the raw event data */
function extractAllFields(raw: unknown): { name: string; value: string }[] {
  try {
    const eventObj = (raw as any)?.Event ?? raw;
    const eventData = eventObj?.EventData;
    if (!eventData) return [];

    let dataArray = eventData.Data;
    if (!dataArray) return [];
    if (!Array.isArray(dataArray)) dataArray = [dataArray];

    const fields: { name: string; value: string }[] = [];
    for (const item of dataArray) {
      if (!item || typeof item !== 'object') continue;
      const name = (item as Record<string, string>)['@Name'];
      const value = (item as Record<string, string>)['#text'] ?? '';
      if (!name || !value || STRUCTURED_FIELDS.has(name) || EMPTY_VALUES.has(value)) continue;
      fields.push({ name, value });
    }
    return fields;
  } catch {
    return [];
  }
}

/** Format known coded values into readable text */
function formatFieldValue(name: string, value: string): string {
  // Impersonation levels
  if (name === 'ImpersonationLevel') {
    const levels: Record<string, string> = {
      '%%1832': 'Identification',
      '%%1833': 'Impersonation',
      '%%1834': 'Delegation',
      '%%1840': 'Anonymous',
    };
    return levels[value] ?? value;
  }
  // Virtual account / restricted admin yes/no
  if (name === 'VirtualAccount' || name === 'RestrictedAdminMode') {
    if (value === '%%1843') return 'No';
    if (value === '%%1842') return 'Yes';
  }
  // Kerberos encryption types
  if (name === 'TicketEncryptionType') {
    const types: Record<string, string> = {
      '0x1': 'DES-CBC-CRC',
      '0x3': 'DES-CBC-MD5',
      '0x11': 'AES128-CTS',
      '0x12': 'AES256-CTS',
      '0x17': 'RC4-HMAC',
      '0x18': 'RC4-HMAC-EXP',
    };
    return types[value.toLowerCase()] ?? value;
  }
  return value;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EventDetailRow({ event }: { event: WinEvent }) {
  const [showRaw, setShowRaw] = useState(false);
  const data = parseEventData(event);

  if (!data) {
    return (
      <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">
        No event data available
      </div>
    );
  }

  const isFailedLogon = event.eventId === 4625;
  const failureReason = getFailureReason(data.failureStatus, data.failureSubStatus);
  const hasNetwork = (data.ipAddress && data.ipAddress !== '-') || data.ipPort;
  const hasAuth = data.authPackage || data.logonProcess || data.processName || data.workstationName;

  const initiator = data.subjectDomainName && data.subjectDomainName !== '-'
    ? `${data.subjectDomainName}\\${data.subjectUserName}`
    : data.subjectUserName;

  const extraFields = extractAllFields(data.raw);
  const hasRightColumn = hasNetwork || hasAuth || extraFields.length > 0;

  return (
    <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      <div className={`h-0.5 ${isFailedLogon ? 'bg-[#f85149]' : 'bg-[#1f6feb]'}`} />
      <div className={`p-4 grid grid-cols-1 ${hasRightColumn ? 'md:grid-cols-2' : ''} gap-x-8 gap-y-0`}>
        {/* Identity */}
        <div>
          <SectionLabel>Identity</SectionLabel>
          <Row label="Target User" value={data.targetUserName} />
          <Row label="Domain" value={data.targetDomainName} />
          {initiator && initiator !== '-' && (
            <Row label="Subject User" value={initiator} />
          )}
          {data.logonType >= 0 && (
            <Row label="Logon Type" value={
              <span>
                {data.logonType}
                <span className="ml-1.5 text-gray-100">
                  {LOGON_TYPE_LABELS[data.logonType] ?? ''}
                </span>
              </span>
            } />
          )}
          {data.elevatedToken && (
            <Row label="Elevated" value={<Badge color="#f97583">ADMIN</Badge>} />
          )}
        </div>

        {/* Network + Auth + Extra fields */}
        {hasRightColumn && (
          <div>
            {hasNetwork && (
              <>
                <SectionLabel>Network</SectionLabel>
                {data.ipAddress && data.ipAddress !== '-' && (
                  <Row
                    label="IP Address"
                    value={data.ipPort ? `${data.ipAddress}:${data.ipPort}` : data.ipAddress}
                  />
                )}
                {data.workstationName && data.workstationName !== '-' && (
                  <Row label="Workstation" value={data.workstationName} />
                )}
              </>
            )}
            {hasAuth && (
              <>
                <SectionLabel>Authentication</SectionLabel>
                {data.authPackage && <Row label="Auth Package" value={data.authPackage} />}
                {data.logonProcess && <Row label="Logon Process" value={data.logonProcess} />}
                {data.processName && data.processName !== '-' && (
                  <Row label="Process" value={formatProcessName(data.processName)} />
                )}
                {data.keyLength >= 0 && (
                  <Row label="Key Length" value={`${data.keyLength}-bit`} />
                )}
              </>
            )}
            {extraFields.length > 0 && (
              <>
                <SectionLabel>Details</SectionLabel>
                {extraFields.map(({ name, value }) => (
                  <Row
                    key={name}
                    label={FIELD_LABELS[name] ?? name.replace(/([A-Z])/g, ' $1').trim()}
                    value={formatFieldValue(name, value)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Failure reason */}
      {isFailedLogon && failureReason && (
        <div className="mx-4 mb-3 px-3 py-2 rounded bg-[#f85149]/10 border border-[#f85149]/20">
          <span className="text-[11px] text-[#f85149] font-medium">{failureReason}</span>
          {data.failureSubStatus && (
            <span className="ml-2 text-[10px] text-white font-mono">{data.failureSubStatus}</span>
          )}
        </div>
      )}

      {/* Raw data toggle */}
      <div className="border-t border-[#21262d] px-4 py-2">
        <button
          onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
          className="text-[11px] text-gray-200 hover:text-white transition-colors"
        >
          {showRaw ? 'Hide' : 'Show'} raw eventData
        </button>
        {showRaw && (
          <pre className="mt-2 p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto max-h-60 overflow-y-auto">
            {JSON.stringify(data.raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
