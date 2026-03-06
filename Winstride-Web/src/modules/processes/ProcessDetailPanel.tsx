import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchEventsPaged } from '../../api/client';
import { getDataArray, getDataField } from '../../shared/eventParsing';
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
  Low: 'text-[#56d364]',
  Medium: 'text-[#79c0ff]',
  High: 'text-[#f0a050]',
  System: 'text-[#ff7b72]',
};

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[#58a6ff] font-semibold uppercase tracking-wider">{label}</span>
      <span className={`text-[12px] text-white break-all ${mono ? 'font-mono bg-[#0d1117] px-2 py-1 rounded' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export default function ProcessDetailPanel({ process, onClose }: Props) {
  const isPowerShell = /^(powershell|pwsh)\.exe$/i.test(process.imageName);

  // Fetch Sysmon Event 1 matching this PID + machine
  const { data: sysmonData, isLoading: sysmonLoading } = useQuery({
    queryKey: ['process-sysmon', process.machineName, process.pid, process.imageName],
    queryFn: () => fetchEventsPaged({
      $filter: `logName eq 'Microsoft-Windows-Sysmon/Operational' and eventId eq 1 and machineName eq '${process.machineName}'`,
      $orderby: 'timeCreated desc',
      $top: '50',
    }),
    staleTime: 60_000,
  });

  // Find the best matching Sysmon Event 1 for this PID
  const sysmonMatch = useMemo(() => {
    if (!sysmonData?.events) return null;
    const snapshotTime = new Date(process.timeSynced).getTime();

    for (const event of sysmonData.events) {
      const data = getDataArray(event);
      if (!data) continue;
      const pid = parseInt(getDataField(data, 'ProcessId') || '0', 10);
      const imageName = basename(getDataField(data, 'Image'));
      if (pid === process.pid && imageName.toLowerCase() === process.imageName.toLowerCase()) {
        const eventTime = new Date(event.timeCreated).getTime();
        if (eventTime <= snapshotTime) {
          return { event, parsed: parseSysmonMatch(event) };
        }
      }
    }
    return null;
  }, [sysmonData, process]);

  // Fetch PowerShell 4104 events if this is a PowerShell process
  const { data: psData, isLoading: psLoading } = useQuery({
    queryKey: ['process-ps', process.machineName, process.pid],
    queryFn: () => fetchEventsPaged({
      $filter: `logName eq 'Microsoft-Windows-PowerShell/Operational' and eventId eq 4104 and machineName eq '${process.machineName}'`,
      $orderby: 'timeCreated desc',
      $top: '50',
    }),
    enabled: isPowerShell,
    staleTime: 60_000,
  });

  // Correlate PS scripts by PID from System.Execution.ProcessID
  const psScripts = useMemo(() => {
    if (!psData?.events || !isPowerShell) return [];
    const results: { text: string; path: string; time: string; id: string }[] = [];

    for (const event of psData.events) {
      // Parse System.Execution.ProcessID
      let eventDataParsed: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(event.eventData ?? '{}');
        eventDataParsed = parsed?.Event ?? parsed;
      } catch { continue; }

      const system = (eventDataParsed as Record<string, unknown>)?.System as Record<string, unknown> | undefined;
      const execPid = parseInt(
        String((system?.Execution as Record<string, string>)?.['@ProcessID'] ?? '0'),
        10,
      );

      if (execPid !== process.pid) continue;

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
  }, [psData, process, isPowerShell]);

  return (
    <div className="flex flex-col h-full overflow-y-auto gf-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[#30363d] flex-shrink-0">
        <div>
          <div className="text-[14px] font-semibold text-white">{process.imageName}</div>
          <div className="text-[11px] text-gray-300">
            PID {process.pid}
            {process.parentPid != null && <span> &middot; Parent {process.parentPid}</span>}
            {' '}&middot; Session {process.sessionId}
            {' '}&middot; {formatMemory(process.workingSetSize)}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg px-2"
        >
          &times;
        </button>
      </div>

      <div className="p-3 space-y-4 flex-1">
        {/* Sysmon Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-[#58a6ff]">Sysmon Creation Event</span>
            {sysmonLoading && (
              <div className="w-3 h-3 border border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            )}
          </div>

          {!sysmonLoading && !sysmonMatch && (
            <div className="text-[11px] text-gray-400 bg-[#0d1117] rounded px-3 py-2">
              No matching Sysmon Event 1 found for PID {process.pid}.
              The process may have started before Sysmon began logging.
            </div>
          )}

          {sysmonMatch?.parsed && (
            <div className="space-y-2 bg-[#0d1117] rounded p-3 border border-[#21262d]">
              <InfoRow label="Full Path" value={sysmonMatch.parsed.image} mono />
              <InfoRow label="Command Line" value={sysmonMatch.parsed.commandLine} mono />
              <InfoRow label="User" value={sysmonMatch.parsed.user} />
              {sysmonMatch.parsed.integrityLevel && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-[#58a6ff] font-semibold uppercase tracking-wider">Integrity</span>
                  <span className={`text-[12px] font-semibold ${INTEGRITY_COLORS[sysmonMatch.parsed.integrityLevel] ?? 'text-white'}`}>
                    {sysmonMatch.parsed.integrityLevel}
                  </span>
                </div>
              )}
              <InfoRow label="Current Directory" value={sysmonMatch.parsed.currentDirectory} mono />
              <InfoRow label="Hashes" value={sysmonMatch.parsed.hashes} mono />
              <InfoRow label="Parent" value={sysmonMatch.parsed.parentImage} mono />
              <InfoRow label="Parent Command Line" value={sysmonMatch.parsed.parentCommandLine} mono />
              <div className="text-[10px] text-gray-400 pt-1">
                Event time: {new Date(sysmonMatch.event.timeCreated).toLocaleString()}
              </div>
            </div>
          )}

          {/* View in Sysmon link */}
          <Link
            to={`/sysmon`}
            className="inline-flex items-center gap-1.5 mt-2 text-[11px] text-[#58a6ff] hover:text-[#79c0ff] hover:underline"
          >
            View in Sysmon &rarr;
          </Link>
        </div>

        {/* PowerShell Section */}
        {isPowerShell && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-[#da8ee7]">PowerShell Scripts</span>
              {psLoading && (
                <div className="w-3 h-3 border border-gray-600 border-t-gray-300 rounded-full animate-spin" />
              )}
              {psScripts.length > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#da8ee7]/20 text-[#da8ee7]">
                  {psScripts.length}
                </span>
              )}
            </div>

            {!psLoading && psScripts.length === 0 && (
              <div className="text-[11px] text-gray-400 bg-[#0d1117] rounded px-3 py-2">
                No PowerShell script blocks found for PID {process.pid}.
              </div>
            )}

            {psScripts.length > 0 && (
              <div className="space-y-2">
                {psScripts.map((script, i) => (
                  <div key={script.id || i} className="bg-[#0d1117] border border-[#21262d] rounded">
                    <div className="px-2.5 py-1.5 flex items-center gap-2 border-b border-[#21262d]">
                      <span className="text-[10px] text-gray-300">
                        {new Date(script.time).toLocaleTimeString()}
                      </span>
                      {script.path && (
                        <span className="text-[10px] text-[#79c0ff] font-mono truncate">{script.path}</span>
                      )}
                    </div>
                    <pre className="font-mono text-[10px] text-gray-200 whitespace-pre-wrap break-all max-h-40 overflow-y-auto px-2.5 py-2">
                      {script.text}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            <Link
              to={`/powershell`}
              className="inline-flex items-center gap-1.5 mt-2 text-[11px] text-[#da8ee7] hover:text-[#e9a8f2] hover:underline"
            >
              View in PowerShell &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
