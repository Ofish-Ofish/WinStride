import { useState } from 'react';
import type { WinEvent } from '../../security/shared/types';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';
import { INTEGRITY_COLORS } from '../shared/eventMeta';

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-[#21262d]/60">
      <span className="text-[11px] text-gray-200 uppercase tracking-wider shrink-0 mr-4">{label}</span>
      <span className={`text-[12px] text-white text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-[#58a6ff] uppercase tracking-widest mt-3 mb-1 font-semibold">{children}</div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-2 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white border border-[#30363d] rounded transition-colors"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Event 1: Process Create                                            */
/* ------------------------------------------------------------------ */

function ProcessCreateDetail({ event }: { event: WinEvent }) {
  const [showRaw, setShowRaw] = useState(false);
  const data = parseProcessCreate(event);

  if (!data) {
    return <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">No process data available</div>;
  }

  const integrityColor = INTEGRITY_COLORS[data.integrityLevel] ?? 'text-gray-300';

  return (
    <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      <div className="h-0.5 bg-[#58a6ff]" />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
        {/* Identity */}
        <div>
          <SectionLabel>Process</SectionLabel>
          <Row label="Image" value={data.image} mono />
          <Row label="Command Line" value={data.commandLine} mono />
          <Row label="User" value={data.user} />
          <Row label="Integrity" value={<span className={integrityColor}>{data.integrityLevel}</span>} />
          <Row label="Current Dir" value={data.currentDirectory} mono />
        </div>

        {/* Parent + IDs */}
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

      <div className="border-t border-[#21262d] px-4 py-2">
        <button
          onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
          className="text-[11px] text-gray-200 hover:text-white transition-colors"
        >
          {showRaw ? 'Hide' : 'Show'} raw eventData
        </button>
        {showRaw && event.eventData && (
          <pre className="mt-2 p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto max-h-60 overflow-y-auto">
            {JSON.stringify(JSON.parse(event.eventData), null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event 3: Network Connect                                           */
/* ------------------------------------------------------------------ */

function NetworkConnectDetail({ event }: { event: WinEvent }) {
  const [showRaw, setShowRaw] = useState(false);
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

      <div className="border-t border-[#21262d] px-4 py-2">
        <button
          onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
          className="text-[11px] text-gray-200 hover:text-white transition-colors"
        >
          {showRaw ? 'Hide' : 'Show'} raw eventData
        </button>
        {showRaw && event.eventData && (
          <pre className="mt-2 p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto max-h-60 overflow-y-auto">
            {JSON.stringify(JSON.parse(event.eventData), null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event 11: File Create                                              */
/* ------------------------------------------------------------------ */

function FileCreateDetail({ event }: { event: WinEvent }) {
  const [showRaw, setShowRaw] = useState(false);
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

      <div className="border-t border-[#21262d] px-4 py-2">
        <button
          onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
          className="text-[11px] text-gray-200 hover:text-white transition-colors"
        >
          {showRaw ? 'Hide' : 'Show'} raw eventData
        </button>
        {showRaw && event.eventData && (
          <pre className="mt-2 p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto max-h-60 overflow-y-auto">
            {JSON.stringify(JSON.parse(event.eventData), null, 2)}
          </pre>
        )}
      </div>
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
