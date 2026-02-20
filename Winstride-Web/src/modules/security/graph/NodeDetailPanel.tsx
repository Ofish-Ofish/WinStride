import type { SelectedElement } from '../../../shared/graph';
import { FAILURE_STATUS_LABELS } from '../shared/eventMeta';

const TYPE_COLORS: Record<string, string> = {
  user: '#58a6ff',
  privileged: '#f97583',
  machine: '#3fb950',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${mo}/${day} ${h}:${min}\u00A0${ampm}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-[#21262d]">
      <span className="text-[11px] text-gray-500 uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-[12px] text-gray-300 font-mono text-right max-w-[60%] break-all">
        {value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-gray-600 uppercase tracking-widest mt-2.5 mb-1">{children}</div>
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

function formatProcessName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function getFailureReason(status: string, subStatus: string): string | null {
  const sub = FAILURE_STATUS_LABELS[subStatus?.toLowerCase()];
  if (sub) return sub;
  const main = FAILURE_STATUS_LABELS[status?.toLowerCase()];
  if (main) return main;
  return null;
}

function NodePanel({ data }: { data: Record<string, unknown> }) {
  const nodeType = data.type as string;
  const privileged = data.privileged as boolean;
  const colorKey = nodeType === 'machine' ? 'machine' : privileged ? 'privileged' : 'user';
  const color = TYPE_COLORS[colorKey];
  const typeLabel = nodeType === 'machine' ? 'Machine' : privileged ? 'Privileged User' : 'User';

  const logonCount = data.logonCount as number;
  const failedCount = data.failedCount as number;
  const successCount = data.successCount as number;
  const connectedCount = data.connectedCount as number;
  const authPackages = data.authPackages as string[];
  const hadAdminSession = data.hadAdminSession as boolean;
  const lastIp = data.lastIp as string;
  const lastSeen = data.lastSeen as string;

  const isUser = nodeType === 'user';
  const connectedLabel = isUser ? 'Machines' : 'Users';

  return (
    <div className="absolute top-3 right-3 w-68 bg-[#0d1117]/95 border border-[#21262d] rounded-lg backdrop-blur-md shadow-2xl overflow-hidden max-h-[calc(100%-24px)] overflow-y-auto">
      <div className="h-0.5" style={{ background: color }} />
      <div className="p-3.5">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: color, boxShadow: `0 0 8px ${color}80` }}
          />
          <h3 className="text-[13px] font-semibold text-gray-100 truncate">
            {data.label as string}
          </h3>
          {hadAdminSession && <Badge color="#f97583">ADMIN</Badge>}
        </div>
        <Row label="Type" value={typeLabel} />
        <Row label={connectedLabel} value={connectedCount} />

        {/* Activity breakdown */}
        <SectionLabel>Activity</SectionLabel>
        <Row label="Total events" value={logonCount} />
        {successCount > 0 && <Row label="Successful" value={successCount} />}
        {failedCount > 0 && (
          <Row label="Failed" value={
            <span className="text-[#f85149]">{failedCount}</span>
          } />
        )}
        {lastSeen && <Row label="Last seen" value={formatTime(lastSeen)} />}

        {/* Network (user nodes only) */}
        {isUser && lastIp && lastIp !== '-' && (
          <>
            <SectionLabel>Network</SectionLabel>
            <Row label="Last IP" value={lastIp} />
          </>
        )}

        {/* Authentication methods */}
        {authPackages.length > 0 && (
          <>
            <SectionLabel>Auth methods</SectionLabel>
            <div className="flex flex-wrap gap-1 py-1.5">
              {authPackages.map((pkg) => (
                <span key={pkg} className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] text-gray-400 font-mono">
                  {pkg}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EdgePanel({ data }: { data: Record<string, unknown> }) {
  const firstSeen = data.firstSeen as string;
  const lastSeen = data.lastSeen as string;
  const logonTypeLabel = data.logonTypeLabel as string;
  const ipAddress = data.ipAddress as string;
  const ipPort = data.ipPort as string;
  const subjectUserName = data.subjectUserName as string;
  const subjectDomainName = data.subjectDomainName as string;
  const targetDomainName = data.targetDomainName as string;
  const authPackage = data.authPackage as string;
  const logonProcess = data.logonProcess as string;
  const workstationName = data.workstationName as string;
  const processName = data.processName as string;
  const keyLength = data.keyLength as number;
  const elevatedToken = data.elevatedToken as boolean;
  const failureStatus = data.failureStatus as string;
  const failureSubStatus = data.failureSubStatus as string;

  const failureReason = getFailureReason(failureStatus, failureSubStatus);
  const hasAuthDetails = authPackage || logonProcess || processName || workstationName;
  const hasNetworkDetails = (ipAddress && ipAddress !== '-') || ipPort;
  const isFailedLogon = !!failureStatus && failureStatus !== '0x0';

  const initiator = subjectDomainName && subjectDomainName !== '-'
    ? `${subjectDomainName}\\${subjectUserName}`
    : subjectUserName;

  return (
    <div className="absolute top-3 right-3 w-72 bg-[#0d1117]/95 border border-[#21262d] rounded-lg backdrop-blur-md shadow-2xl overflow-hidden max-h-[calc(100%-24px)] overflow-y-auto">
      <div className={`h-0.5 ${isFailedLogon ? 'bg-[#f85149]' : 'bg-[#e3b341]'}`} />
      <div className="p-3.5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[13px] font-semibold text-gray-100 truncate">{logonTypeLabel}</h3>
          {elevatedToken && <Badge color="#f97583">ADMIN</Badge>}
        </div>

        {/* Failure reason */}
        {isFailedLogon && failureReason && (
          <div className="mb-2.5 px-2 py-1.5 rounded bg-[#f85149]/10 border border-[#f85149]/20">
            <span className="text-[11px] text-[#f85149] font-medium">{failureReason}</span>
          </div>
        )}
        {isFailedLogon && !failureReason && failureSubStatus && (
          <Row label="Status" value={failureSubStatus} />
        )}

        {/* Identity */}
        <Row label="User" value={(data.source as string).replace(/^user:/, '')} />
        <Row label="Machine" value={(data.target as string).replace(/^machine:/, '')} />
        {targetDomainName && <Row label="Domain" value={targetDomainName} />}
        {initiator && initiator !== '-' && (
          <Row label="Initiated by" value={initiator} />
        )}

        {/* Network */}
        {hasNetworkDetails && (
          <>
            <SectionLabel>Network</SectionLabel>
            {ipAddress && ipAddress !== '-' && (
              <Row label="IP Address" value={ipPort ? `${ipAddress}:${ipPort}` : ipAddress} />
            )}
            {workstationName && workstationName !== '-' && (
              <Row label="Source host" value={workstationName} />
            )}
          </>
        )}

        {/* Authentication */}
        {hasAuthDetails && (
          <>
            <SectionLabel>Authentication</SectionLabel>
            {authPackage && <Row label="Auth" value={authPackage} />}
            {logonProcess && <Row label="Logon process" value={logonProcess} />}
            {processName && processName !== '-' && (
              <Row label="Process" value={formatProcessName(processName)} />
            )}
            {keyLength >= 0 && <Row label="Key length" value={`${keyLength}-bit`} />}
          </>
        )}

        {/* Activity */}
        <SectionLabel>Activity</SectionLabel>
        <Row label="Events" value={data.logonCount as number} />
        {firstSeen && <Row label="First seen" value={formatTime(firstSeen)} />}
        {lastSeen && <Row label="Last seen" value={formatTime(lastSeen)} />}
      </div>
    </div>
  );
}

export default function NodeDetailPanel({ selected }: { selected: SelectedElement }) {
  const { type, data } = selected;

  if (type === 'node') return <NodePanel data={data} />;
  return <EdgePanel data={data} />;
}
