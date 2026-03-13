import type { Detection } from '../../../shared/detection/rules';
import { parseScriptBlock, parseCommandExecution, findSuspiciousKeywords } from '../shared/parsePSEvent';
import { Row, SectionLabel, CodeBlock, CopyIconButton, DetectionBlock, DetailCard, Badge } from '../../../components/list/DetailPrimitives';
import type { PSEnrichedEvent } from '../shared/types';

/* ------------------------------------------------------------------ */
/*  Highlighted script text                                            */
/* ------------------------------------------------------------------ */

function HighlightedScript({ text }: { text: string }) {
  const keywords = findSuspiciousKeywords(text);
  if (keywords.length === 0) {
    return <>{text}</>;
  }

  const pattern = new RegExp(`(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <span key={i} className="bg-[#f85149]/25 text-[#ff7b72] rounded px-0.5">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function CorrelationBadge({ event }: { event: PSEnrichedEvent }) {
  if (event.correlationSource === 'none') return null;

  const color = event.correlationSource === 'powershell+sysmon'
    ? '#56d364'
    : event.correlationSource === 'sysmon'
      ? '#58a6ff'
      : '#f0a050';
  const label = event.correlationSource === 'powershell+sysmon'
    ? 'PowerShell + Sysmon'
    : event.correlationSource === 'sysmon'
      ? 'Sysmon Correlated'
      : 'PowerShell Context';

  return <Badge color={color}>{label}</Badge>;
}

function CorrelatedProcessSection({ event }: { event: PSEnrichedEvent }) {
  if (
    event.correlatedPid == null &&
    !event.correlatedProcessName &&
    !event.correlatedUser &&
    !event.correlatedCommandLine &&
    !event.correlatedHostApplication
  ) {
    return null;
  }

  return (
    <div className="mt-4">
      <SectionLabel>Process Context</SectionLabel>
      <Row label="PID" value={event.correlatedPid != null ? String(event.correlatedPid) : ''} mono />
      <Row label="Process" value={event.correlatedProcessName || event.correlatedHostApplication} />
      <Row label="Host App" value={event.correlatedHostApplication} mono />
      <Row label="User" value={event.correlatedUser} />
      <Row label="Path" value={event.correlatedProcessPath} mono />
      <Row label="Command Line" value={event.correlatedCommandLine} mono />
      <Row label="Parent" value={event.correlatedParentImage} mono />
      <Row label="Logon ID" value={event.correlatedLogonId} mono />
      <Row
        label="Sysmon Time"
        value={event.correlatedSysmonTime ? new Date(event.correlatedSysmonTime).toLocaleString() : ''}
      />
    </div>
  );
}

export default function PSDetailRow({ event, detections }: { event: PSEnrichedEvent; detections?: Detection[] }) {
  if (event.eventId === 4104) {
    const sb = parseScriptBlock(event);
    if (!sb) {
      return (
        <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">
          No script block data available
        </div>
      );
    }

    return (
      <DetailCard color={sb.isSuspicious ? '#f85149' : '#1f6feb'} raw={event.eventData}>
        <DetectionBlock detections={detections} />
        <div className="p-4">
          {/* Info bar */}
          <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] text-gray-400">
            <CorrelationBadge event={event} />
            {event.correlatedPid != null && (
              <span>
                <span className="text-gray-500">PID:</span>{' '}
                <span className="font-mono text-gray-300">{event.correlatedPid}</span>
              </span>
            )}
            {event.correlatedProcessName && (
              <span>
                <span className="text-gray-500">Process:</span>{' '}
                <span className="font-mono text-gray-300">{event.correlatedProcessName}</span>
              </span>
            )}
            {event.correlatedUser && (
              <span>
                <span className="text-gray-500">User:</span>{' '}
                <span className="font-mono text-gray-300">{event.correlatedUser}</span>
              </span>
            )}
            {sb.scriptBlockId && (
              <span>
                <span className="text-gray-500">ScriptBlockId:</span>{' '}
                <span className="font-mono text-gray-300">{sb.scriptBlockId}</span>
              </span>
            )}
            {sb.messageTotal > 1 && (
              <span className="text-[#58a6ff]">
                Part {sb.messageNumber}/{sb.messageTotal}
              </span>
            )}
            {sb.path && (
              <span>
                <span className="text-gray-500">Path:</span>{' '}
                <span className="font-mono text-gray-300">{sb.path}</span>
              </span>
            )}
          </div>

          {/* Suspicious matches */}
          {sb.suspiciousMatches.length > 0 && (
            <div className="mb-3 px-3 py-2 rounded bg-[#f85149]/10 border border-[#f85149]/20">
              <span className="text-[11px] text-[#f85149] font-medium">
                Suspicious keywords: {sb.suspiciousMatches.join(', ')}
              </span>
            </div>
          )}

          {/* Script block text */}
          <SectionLabel>Script Block</SectionLabel>
            <div className="relative group/cb mt-1">
              <div className="absolute right-5 top-2 z-10 opacity-0 group-hover/cb:opacity-100 transition-opacity">
                <CopyIconButton text={sb.scriptBlockText} title="Copy script block" />
            </div>
            <pre className="p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-words">
              <HighlightedScript text={sb.scriptBlockText} />
            </pre>
          </div>

          <CorrelatedProcessSection event={event} />
        </div>
      </DetailCard>
    );
  }

  if (event.eventId === 4103) {
    const cmd = parseCommandExecution(event);
    if (!cmd) {
      return (
        <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">
          No command data available
        </div>
      );
    }

    const suspiciousMatches = findSuspiciousKeywords(cmd.commandName + ' ' + cmd.payload);

    return (
      <DetailCard color={suspiciousMatches.length > 0 ? '#f0883e' : '#1f6feb'} raw={event.eventData}>
        <DetectionBlock detections={detections} />
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
            <CorrelationBadge event={event} />
            {event.correlatedPid != null && (
              <span>
                <span className="text-gray-500">PID:</span>{' '}
                <span className="font-mono text-gray-300">{event.correlatedPid}</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
            <div>
              <SectionLabel>Command Info</SectionLabel>
              <Row label="Command Name" value={cmd.commandName} />
              <Row label="Command Type" value={cmd.commandType} />
              <Row label="Script Name" value={cmd.scriptName} />
              <Row label="User" value={cmd.user} />
              <Row label="Host Application" value={cmd.hostApplication} />
            </div>

            <div>
              {cmd.payload && (
                <>
                  <SectionLabel>Payload</SectionLabel>
                  <CodeBlock text={cmd.payload} className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words" />
                </>
              )}
              {suspiciousMatches.length > 0 && (
                <div className="mt-3 px-3 py-2 rounded bg-[#f85149]/10 border border-[#f85149]/20">
                  <span className="text-[11px] text-[#f85149] font-medium">
                    Suspicious keywords: {suspiciousMatches.join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <CorrelatedProcessSection event={event} />
        </div>
      </DetailCard>
    );
  }

  return (
    <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">
      Unsupported event type
    </div>
  );
}
