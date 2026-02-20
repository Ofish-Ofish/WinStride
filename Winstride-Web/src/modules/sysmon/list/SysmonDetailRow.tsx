import type { WinEvent } from '../../security/shared/types';
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

export default function SysmonDetailRow({ event }: { event: WinEvent }) {
  switch (event.eventId) {
    case 1: return <ProcessCreateDetail event={event} />;
    case 3: return <NetworkConnectDetail event={event} />;
    case 11: return <FileCreateDetail event={event} />;
    default:
      return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">Unsupported event type</div>;
  }
}
