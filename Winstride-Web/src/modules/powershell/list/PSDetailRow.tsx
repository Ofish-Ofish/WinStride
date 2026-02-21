import type { WinEvent } from '../../security/shared/types';
import type { Detection } from '../../../shared/detection/rules';
import { SEVERITY_COLORS } from '../../../shared/detection/engine';
import { parseScriptBlock, parseCommandExecution, findSuspiciousKeywords } from '../shared/parsePSEvent';
import { Row, SectionLabel, RawDataToggle } from '../../../components/list/DetailPrimitives';

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

export default function PSDetailRow({ event, detections }: { event: WinEvent; detections?: Detection[] }) {
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
      <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
        <div className={`h-0.5 ${sb.isSuspicious ? 'bg-[#f85149]' : 'bg-[#1f6feb]'}`} />
        <div className="p-4">
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
          {/* Info bar */}
          <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] text-gray-400">
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
          <pre className="mt-1 p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-words">
            <HighlightedScript text={sb.scriptBlockText} />
          </pre>
        </div>

        <RawDataToggle raw={event.eventData} />
      </div>
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
      <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
        <div className={`h-0.5 ${suspiciousMatches.length > 0 ? 'bg-[#f0883e]' : 'bg-[#1f6feb]'}`} />
        <div className="p-4">
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
                  <pre className="mt-1 p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                    {cmd.payload}
                  </pre>
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
        </div>

        <RawDataToggle raw={event.eventData} />
      </div>
    );
  }

  return (
    <div className="px-6 py-4 text-[12px] text-gray-300 italic bg-[#0d1117]">
      Unsupported event type
    </div>
  );
}
