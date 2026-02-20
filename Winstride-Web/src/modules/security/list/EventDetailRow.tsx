import { useState } from 'react';
import type { WinEvent } from '../shared/types';
import { LOGON_TYPE_LABELS, FAILURE_STATUS_LABELS } from '../shared/eventMeta';
import { parseEventData } from './listColumns';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-[#21262d]/60">
      <span className="text-[11px] text-gray-500 uppercase tracking-wider shrink-0 mr-4">{label}</span>
      <span className="text-[12px] text-gray-300 font-mono text-right break-all">{value}</span>
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
    <div className="text-[10px] text-gray-600 uppercase tracking-widest mt-3 mb-1">{children}</div>
  );
}

function formatProcessName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function getFailureReason(status: string, subStatus: string): string | null {
  return FAILURE_STATUS_LABELS[subStatus?.toLowerCase()]
    ?? FAILURE_STATUS_LABELS[status?.toLowerCase()]
    ?? null;
}

export default function EventDetailRow({ event }: { event: WinEvent }) {
  const [showRaw, setShowRaw] = useState(false);
  const data = parseEventData(event);

  if (!data) {
    return (
      <div className="px-6 py-4 text-[12px] text-gray-500 italic bg-[#0d1117]">
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

  return (
    <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      <div className={`h-0.5 ${isFailedLogon ? 'bg-[#f85149]' : 'bg-[#1f6feb]'}`} />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
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
                <span className="ml-1.5 text-gray-500">
                  {LOGON_TYPE_LABELS[data.logonType] ?? ''}
                </span>
              </span>
            } />
          )}
          {data.elevatedToken && (
            <Row label="Elevated" value={<Badge color="#f97583">ADMIN</Badge>} />
          )}
        </div>

        {/* Network + Auth */}
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
        </div>
      </div>

      {/* Failure reason */}
      {isFailedLogon && failureReason && (
        <div className="mx-4 mb-3 px-3 py-2 rounded bg-[#f85149]/10 border border-[#f85149]/20">
          <span className="text-[11px] text-[#f85149] font-medium">{failureReason}</span>
          {data.failureSubStatus && (
            <span className="ml-2 text-[10px] text-gray-500 font-mono">{data.failureSubStatus}</span>
          )}
        </div>
      )}

      {/* Raw data toggle */}
      <div className="border-t border-[#21262d] px-4 py-2">
        <button
          onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          {showRaw ? 'Hide' : 'Show'} raw eventData
        </button>
        {showRaw && (
          <pre className="mt-2 p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-400 font-mono overflow-x-auto max-h-60 overflow-y-auto">
            {JSON.stringify(data.raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
