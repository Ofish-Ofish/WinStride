import type { WinEvent } from '../../security/shared/types';
import type { Detection } from '../../../shared/detection/rules';
import { SEVERITY_COLORS } from '../../../shared/detection/engine';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';
import { INTEGRITY_COLORS } from '../shared/eventMeta';
import { Row, SectionLabel, CopyButton, RawDataToggle } from '../../../components/list/DetailPrimitives';

/* ------------------------------------------------------------------ */
/*  Event 1: Process Create                                            */
/* ------------------------------------------------------------------ */

function ProcessCreateDetail({ event }: { event: WinEvent }) {
  const data = parseProcessCreate(event);

  if (!data) {
    return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">No process data available</div>;
  }

  const integrityColor = INTEGRITY_COLORS[data.integrityLevel] ?? 'text-gray-300';

  return (
    <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      <div className="h-0.5 bg-[#58a6ff]" />
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

      <RawDataToggle raw={event.eventData} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event 3: Network Connect                                           */
/* ------------------------------------------------------------------ */

function NetworkConnectDetail({ event }: { event: WinEvent }) {
  const data = parseNetworkConnect(event);

  if (!data) {
    return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">No network data available</div>;
  }

  return (
    <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      <div className="h-0.5 bg-[#3fb950]" />
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

      <RawDataToggle raw={event.eventData} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event 11: File Create                                              */
/* ------------------------------------------------------------------ */

function FileCreateDetail({ event }: { event: WinEvent }) {
  const data = parseFileCreate(event);

  if (!data) {
    return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">No file data available</div>;
  }

  return (
    <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      <div className="h-0.5 bg-[#f0883e]" />
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

      <RawDataToggle raw={event.eventData} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SysmonDetailRow({ event, detections }: { event: WinEvent; detections?: Detection[] }) {
  return (
    <>
      {detections && detections.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <div className="text-[11px] font-semibold text-[#ff7b72]">Detections</div>
          {detections.map((d) => (
            <div key={d.ruleId} className={`text-[11px] px-2 py-1 rounded border ${SEVERITY_COLORS[d.severity].bg} ${SEVERITY_COLORS[d.severity].border}`}>
              <span className={`font-semibold ${SEVERITY_COLORS[d.severity].text}`}>[{d.ruleId}]</span>
              <span className="text-white ml-1.5">{d.ruleName}</span>
              {d.mitre && <span className="text-gray-300 ml-1.5">({d.mitre})</span>}
              <div className="text-gray-300 mt-0.5">{d.description}</div>
            </div>
          ))}
        </div>
      )}
      {event.eventId === 1 && <ProcessCreateDetail event={event} />}
      {event.eventId === 3 && <NetworkConnectDetail event={event} />}
      {event.eventId === 11 && <FileCreateDetail event={event} />}
      {event.eventId !== 1 && event.eventId !== 3 && event.eventId !== 11 && (
        <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">Unsupported event type</div>
      )}
    </>
  );
}
