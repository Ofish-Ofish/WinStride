import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEventsPaged } from '../../api/client';
import { getDataArray, getDataField } from '../../shared/eventParsing';
import { Row, SectionLabel, CodeBlock } from '../../components/list/DetailPrimitives';
import type { WinProcess } from './shared/types';
import type { WinEvent } from '../security/shared/types';
import { formatMemory } from './shared/treeBuilder';

interface Props {
  process: WinProcess;
  onClose: () => void;
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function parseSysmonMatch(event: WinEvent) {
  const data = getDataArray(event);
  if (!data) return null;
  return {
    image: getDataField(data, 'Image'),
    commandLine: getDataField(data, 'CommandLine'),
    user: getDataField(data, 'User'),
    integrityLevel: getDataField(data, 'IntegrityLevel'),
    hashes: getDataField(data, 'Hashes'),
    parentImage: getDataField(data, 'ParentImage'),
    parentCommandLine: getDataField(data, 'ParentCommandLine'),
    currentDirectory: getDataField(data, 'CurrentDirectory'),
    logonId: getDataField(data, 'LogonId'),
  };
}

function parsePsScriptBlock(event: WinEvent) {
  const data = getDataArray(event);
  if (!data) return null;
  return {
    scriptBlockText: getDataField(data, 'ScriptBlockText'),
    scriptBlockId: getDataField(data, 'ScriptBlockId'),
    path: getDataField(data, 'Path'),
  };
}

const INTEGRITY_COLORS: Record<string, string> = {
  Low: 'bg-[#56d364]/15 text-[#56d364]',
  Medium: 'bg-[#79c0ff]/15 text-[#79c0ff]',
  High: 'bg-[#f0a050]/15 text-[#f0a050]',
  System: 'bg-[#ff7b72]/15 text-[#ff7b72]',
};

function Spinner() {
  return <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />;
}

function LinkButton({ href, color, children }: { href: string; color: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-[12px] font-medium rounded-md border transition-colors"
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}10`,
      }}
    >
      {children}
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z" />
      </svg>
    </a>
  );
}

export default function ProcessDetailPanel({ process, onClose }: Props) {
  const isPowerShell = /^(powershell|pwsh)\.exe$/i.test(process.imageName);

  // Fetch Sysmon Event 1 matching this PID + machine (server-side filter)
  const { data: sysmonData, isLoading: sysmonLoading } = useQuery({
    queryKey: ['process-sysmon', process.machineName, process.pid],
    queryFn: () => fetchEventsPaged({
      $filter: `logName eq 'Microsoft-Windows-Sysmon/Operational' and eventId eq 1 and machineName eq '${process.machineName}' and pid eq ${process.pid}`,
      $orderby: 'timeCreated desc',
      $top: '1',
    }),
    staleTime: 60_000,
  });

  const sysmonMatch = useMemo(() => {
    const event = sysmonData?.events?.[0];
    if (!event) return null;
    return { event, parsed: parseSysmonMatch(event) };
  }, [sysmonData]);

  // Fetch PowerShell 4104 events matching this PID via server-side filter
  const { data: psData, isLoading: psLoading } = useQuery({
    queryKey: ['process-ps', process.machineName, process.pid],
    queryFn: () => fetchEventsPaged({
      $filter: `logName eq 'Microsoft-Windows-PowerShell/Operational' and eventId eq 4104 and machineName eq '${process.machineName}' and pid eq ${process.pid}`,
      $orderby: 'timeCreated desc',
      $top: '200',
    }),
    enabled: isPowerShell,
    staleTime: 60_000,
  });

  const psScripts = useMemo(() => {
    if (!psData?.events || !isPowerShell) return [];
    const results: { text: string; path: string; time: string; id: string }[] = [];

    for (const event of psData.events) {
      const block = parsePsScriptBlock(event);
      if (!block?.scriptBlockText) continue;

      results.push({
        text: block.scriptBlockText,
        path: block.path,
        time: event.timeCreated,
        id: block.scriptBlockId,
      });
    }
    return results;
  }, [psData, isPowerShell]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#21262d] flex-shrink-0">
        <div>
          <div className="text-[16px] font-semibold text-white">{process.imageName}</div>
          <div className="flex items-center gap-2 mt-1 text-[12px] text-gray-200">
            <span className="font-mono bg-[#21262d] px-1.5 py-0.5 rounded text-[11px]">PID {process.pid}</span>
            {process.parentPid != null && (
              <span className="font-mono bg-[#21262d] px-1.5 py-0.5 rounded text-[11px]">Parent {process.parentPid}</span>
            )}
            <span className="bg-[#21262d] px-1.5 py-0.5 rounded text-[11px]">Session {process.sessionId}</span>
            <span className="bg-[#21262d] px-1.5 py-0.5 rounded text-[11px]">{formatMemory(process.workingSetSize)}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#21262d] rounded transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-3 space-y-5 flex-1">
        {/* Sysmon Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <SectionLabel>Sysmon Creation Event</SectionLabel>
            {sysmonLoading && <Spinner />}
          </div>

          {!sysmonLoading && !sysmonMatch && (
            <div className="text-[12px] text-gray-300 bg-[#0d1117] rounded-lg px-4 py-3 border border-[#21262d]">
              No matching Sysmon Event 1 found for PID {process.pid}.
              <span className="block text-gray-500 mt-1">The process may have started before Sysmon began logging.</span>
            </div>
          )}

          {sysmonMatch?.parsed && (
            <div className="bg-[#0d1117] rounded-lg border border-[#21262d] overflow-hidden">
              <div className="px-4 py-2 space-y-0.5">
                <Row label="Full Path" value={<span className="font-mono text-[11px]">{sysmonMatch.parsed.image}</span>} />
                {sysmonMatch.parsed.commandLine && (
                  <Row label="Command Line" value={<span className="font-mono text-[11px]">{sysmonMatch.parsed.commandLine}</span>} />
                )}
                <Row label="User" value={sysmonMatch.parsed.user} />
                {sysmonMatch.parsed.integrityLevel && (
                  <Row
                    label="Integrity"
                    value={
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${INTEGRITY_COLORS[sysmonMatch.parsed.integrityLevel] ?? 'text-white'}`}>
                        {sysmonMatch.parsed.integrityLevel}
                      </span>
                    }
                  />
                )}
                <Row label="Directory" value={<span className="font-mono text-[11px]">{sysmonMatch.parsed.currentDirectory}</span>} />
                {sysmonMatch.parsed.hashes && (
                  <Row label="Hashes" value={<span className="font-mono text-[10px]">{sysmonMatch.parsed.hashes}</span>} />
                )}
                <Row label="Parent" value={<span className="font-mono text-[11px]">{sysmonMatch.parsed.parentImage}</span>} />
                {sysmonMatch.parsed.parentCommandLine && (
                  <Row label="Parent Cmd" value={<span className="font-mono text-[11px]">{sysmonMatch.parsed.parentCommandLine}</span>} />
                )}
              </div>
              <div className="px-4 py-2 border-t border-[#21262d] text-[11px] text-gray-400">
                Created: {new Date(sysmonMatch.event.timeCreated).toLocaleString()}
              </div>
            </div>
          )}

          <LinkButton href={`/sysmon?search=pid:${process.pid}`} color="#58a6ff">View in Sysmon</LinkButton>
        </div>

        {/* PowerShell Section */}
        {isPowerShell && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <SectionLabel>PowerShell Scripts</SectionLabel>
              {psLoading && <Spinner />}
              {psScripts.length > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#da8ee7]/20 text-[#da8ee7]">
                  {psScripts.length}
                </span>
              )}
            </div>

            {!psLoading && psScripts.length === 0 && (
              <div className="text-[12px] text-gray-300 bg-[#0d1117] rounded-lg px-4 py-3 border border-[#21262d]">
                No PowerShell script blocks found for PID {process.pid}.
              </div>
            )}

            {psScripts.length > 0 && (
              <div className="space-y-3">
                {psScripts.map((script, i) => (
                  <div key={script.id || i}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-gray-200">
                        {new Date(script.time).toLocaleTimeString()}
                      </span>
                      {script.path && (
                        <span className="text-[11px] text-[#79c0ff] font-mono truncate">{script.path}</span>
                      )}
                    </div>
                    <CodeBlock text={script.text} className="max-h-48" />
                  </div>
                ))}
              </div>
            )}

            <LinkButton href={`/powershell?search=pid:${process.pid}`} color="#da8ee7">View in PowerShell</LinkButton>
          </div>
        )}
      </div>
    </div>
  );
}
