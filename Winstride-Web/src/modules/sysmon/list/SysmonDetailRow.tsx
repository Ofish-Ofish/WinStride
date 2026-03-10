import { useQuery } from '@tanstack/react-query';
import type { WinEvent } from '../../security/shared/types';
import type { Detection } from '../../../shared/detection/rules';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';
import { parseScriptBlock, findSuspiciousKeywords } from '../../powershell/shared/parsePSEvent';
import { INTEGRITY_COLORS } from '../shared/eventMeta';
import { Row, SectionLabel, CopyButton, CodeBlock, DetectionBlock, DetailCard } from '../../../components/list/DetailPrimitives';
import { fetchEventsPaged, fetchProcesses } from '../../../api/client';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Spinner() {
  return <div className="w-3 h-3 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />;
}

function formatMemory(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/* ------------------------------------------------------------------ */
/*  Correlated process + PS data (fetched on-demand for Event 1)       */
/* ------------------------------------------------------------------ */

function CorrelatedProcessInfo({ pid, machineName }: { pid: number; machineName: string }) {
  const { data: procData, isLoading: procLoading } = useQuery({
    queryKey: ['sysmon-corr-proc', machineName, pid],
    queryFn: () => fetchProcesses({
      $filter: `machineName eq '${machineName}' and pid eq ${pid}`,
      $top: '1',
    }),
    staleTime: 60_000,
  });

  const { data: psData, isLoading: psLoading } = useQuery({
    queryKey: ['sysmon-corr-ps', machineName, pid],
    queryFn: () => fetchEventsPaged({
      $filter: `logName eq 'Microsoft-Windows-PowerShell/Operational' and eventId eq 4104 and machineName eq '${machineName}' and pid eq ${pid}`,
      $orderby: 'timeCreated desc',
      $top: '50',
    }),
    staleTime: 60_000,
  });

  const proc = procData?.items?.[0];
  const scripts = psData?.events ?? [];

  if (procLoading && psLoading) {
    return (
      <div className="border-t border-[#21262d] px-4 py-3 flex items-center gap-2 text-[11px] text-gray-400">
        <Spinner /> Loading correlated data...
      </div>
    );
  }

  const hasData = proc || scripts.length > 0;
  if (!hasData) return null;

  return (
    <div className="border-t border-[#21262d]">
      {proc && (
        <div className="px-4 py-3">
          <SectionLabel>Live Process Snapshot</SectionLabel>
          <Row label="Session" value={String(proc.sessionId)} />
          <Row label="Memory" value={formatMemory(proc.workingSetSize)} />
          {proc.parentPid != null && <Row label="Parent PID" value={String(proc.parentPid)} />}
        </div>
      )}

      {scripts.length > 0 && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <SectionLabel>PowerShell Scripts</SectionLabel>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#da8ee7]/20 text-[#da8ee7]">
              {scripts.length}
            </span>
          </div>
          <div className="space-y-2">
            {scripts.slice(0, 5).map((event, i) => {
              const sb = parseScriptBlock(event);
              if (!sb?.scriptBlockText) return null;
              const suspicious = findSuspiciousKeywords(sb.scriptBlockText);
              return (
                <div key={event.id ?? i}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-gray-300">
                      {new Date(event.timeCreated).toLocaleTimeString()}
                    </span>
                    {sb.path && (
                      <span className="text-[10px] text-[#79c0ff] font-mono truncate">{sb.path}</span>
                    )}
                    {suspicious.length > 0 && (
                      <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-[#f85149]/20 text-[#ff7b72]">
                        suspicious
                      </span>
                    )}
                  </div>
                  <CodeBlock text={sb.scriptBlockText} className="max-h-32" />
                </div>
              );
            })}
            {scripts.length > 5 && (
              <div className="text-[11px] text-gray-400">
                +{scripts.length - 5} more script blocks
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event 1: Process Create                                            */
/* ------------------------------------------------------------------ */

function ProcessCreateDetail({ event, detections }: { event: WinEvent; detections?: Detection[] }) {
  const data = parseProcessCreate(event);

  if (!data) {
    return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">No process data available</div>;
  }

  const integrityColor = INTEGRITY_COLORS[data.integrityLevel] ?? 'text-gray-300';

  return (
    <DetailCard color="#58a6ff" raw={event.eventData}>
      <DetectionBlock detections={detections} />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
        <div>
          <SectionLabel>Process</SectionLabel>
          <Row label="Image" value={data.image} mono />
          <Row label="Command Line" value={data.commandLine} mono />
          <Row label="User" value={data.user} />
          <Row label="Integrity" value={<span className={integrityColor}>{data.integrityLevel}</span>} />
          <Row label="Current Dir" value={data.currentDirectory} mono />
        </div>

        <div>
          <SectionLabel>Parent</SectionLabel>
          <Row label="Parent Image" value={data.parentImage} mono />
          <Row label="Parent CmdLine" value={data.parentCommandLine} mono />

          <SectionLabel>Identifiers</SectionLabel>
          <Row label="ProcessGuid" value={data.processGuid} mono />
          <Row label="ProcessId" value={String(data.processId)} mono />
          <Row label="ParentGuid" value={data.parentProcessGuid} mono />
          <Row label="LogonId" value={data.logonId} mono />

          {data.hashes && (
            <>
              <SectionLabel>Hashes</SectionLabel>
              <div className="flex items-start gap-1">
                <pre className="text-[11px] text-gray-200 font-mono break-all whitespace-pre-wrap flex-1">
                  {data.hashes}
                </pre>
                <CopyButton text={data.hashes} />
              </div>
            </>
          )}
        </div>
      </div>
      {data.processId ? (
        <CorrelatedProcessInfo pid={data.processId} machineName={event.machineName} />
      ) : null}
    </DetailCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Event 3: Network Connect                                           */
/* ------------------------------------------------------------------ */

function NetworkConnectDetail({ event, detections }: { event: WinEvent; detections?: Detection[] }) {
  const data = parseNetworkConnect(event);

  if (!data) {
    return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">No network data available</div>;
  }

  return (
    <DetailCard color="#3fb950" raw={event.eventData}>
      <DetectionBlock detections={detections} />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
        <div>
          <SectionLabel>Connection</SectionLabel>
          <Row label="Source" value={`${data.sourceIp}:${data.sourcePort}`} mono />
          <Row label="Destination" value={`${data.destinationIp}:${data.destinationPort}`} mono />
          <Row label="Hostname" value={data.destinationHostname} />
          <Row label="Protocol" value={data.protocol} />
          <Row label="Direction" value={data.initiated ? 'Outbound (Initiated)' : 'Inbound (Accepted)'} />
        </div>

        <div>
          <SectionLabel>Process</SectionLabel>
          <Row label="Image" value={data.image} mono />
          <Row label="User" value={data.user} />
          <Row label="ProcessGuid" value={data.processGuid} mono />
        </div>
      </div>
    </DetailCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Event 11: File Create                                              */
/* ------------------------------------------------------------------ */

function FileCreateDetail({ event, detections }: { event: WinEvent; detections?: Detection[] }) {
  const data = parseFileCreate(event);

  if (!data) {
    return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">No file data available</div>;
  }

  return (
    <DetailCard color="#f0883e" raw={event.eventData}>
      <DetectionBlock detections={detections} />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
        <div>
          <SectionLabel>File</SectionLabel>
          <Row label="Target File" value={data.targetFilename} mono />
          <Row label="Creation Time" value={data.creationUtcTime} />
        </div>

        <div>
          <SectionLabel>Creator</SectionLabel>
          <Row label="Image" value={data.image} mono />
          <Row label="User" value={data.user} />
          <Row label="ProcessGuid" value={data.processGuid} mono />
        </div>
      </div>
    </DetailCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SysmonDetailRow({ event, detections }: { event: WinEvent; detections?: Detection[] }) {
  if (event.eventId === 1) return <ProcessCreateDetail event={event} detections={detections} />;
  if (event.eventId === 3) return <NetworkConnectDetail event={event} detections={detections} />;
  if (event.eventId === 11) return <FileCreateDetail event={event} detections={detections} />;
  return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">Unsupported event type</div>;
}
