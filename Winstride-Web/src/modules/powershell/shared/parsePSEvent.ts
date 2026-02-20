import type { WinEvent } from '../../security/shared/types';
import { SUSPICIOUS_KEYWORDS } from './eventMeta';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ParsedScriptBlock {
  scriptBlockText: string;
  scriptBlockId: string;
  path: string;
  messageNumber: number;
  messageTotal: number;
  isSuspicious: boolean;
  suspiciousMatches: string[];
}

export interface ParsedCommandExecution {
  commandName: string;
  commandType: string;
  scriptName: string;
  user: string;
  hostApplication: string;
  payload: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getDataField(dataArray: unknown[], fieldName: string): string {
  if (!Array.isArray(dataArray)) return '';
  for (const item of dataArray) {
    if (
      item &&
      typeof item === 'object' &&
      (item as Record<string, string>)['@Name'] === fieldName
    ) {
      return (item as Record<string, string>)['#text'] ?? '';
    }
  }
  return '';
}

function getDataArray(event: WinEvent): unknown[] | null {
  if (!event.eventData) return null;
  try {
    const parsed = JSON.parse(event.eventData);
    const eventObj = parsed?.Event ?? parsed;
    const eventData = eventObj?.EventData;
    if (!eventData) return null;
    let dataArray = eventData.Data;
    if (!dataArray) return null;
    if (!Array.isArray(dataArray)) dataArray = [dataArray];
    return dataArray;
  } catch {
    return null;
  }
}

/** Scan script text for suspicious keywords, return matches (case-insensitive). */
export function findSuspiciousKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return SUSPICIOUS_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

/* ------------------------------------------------------------------ */
/*  Parsers                                                            */
/* ------------------------------------------------------------------ */

const scriptBlockCache = new WeakMap<WinEvent, ParsedScriptBlock | null>();

/** Parse Event 4104 — Script Block Logging */
export function parseScriptBlock(event: WinEvent): ParsedScriptBlock | null {
  if (event.eventId !== 4104) return null;
  if (scriptBlockCache.has(event)) return scriptBlockCache.get(event)!;

  const dataArray = getDataArray(event);
  if (!dataArray) { scriptBlockCache.set(event, null); return null; }

  const scriptBlockText = getDataField(dataArray, 'ScriptBlockText');
  const scriptBlockId = getDataField(dataArray, 'ScriptBlockId');
  const path = getDataField(dataArray, 'Path');
  const messageNumber = parseInt(getDataField(dataArray, 'MessageNumber') || '1', 10);
  const messageTotal = parseInt(getDataField(dataArray, 'MessageTotal') || '1', 10);

  const isSuspicious = event.level === 'Warning';
  const suspiciousMatches = findSuspiciousKeywords(scriptBlockText);

  const result: ParsedScriptBlock = {
    scriptBlockText,
    scriptBlockId,
    path,
    messageNumber,
    messageTotal,
    isSuspicious,
    suspiciousMatches,
  };

  scriptBlockCache.set(event, result);
  return result;
}

const commandCache = new WeakMap<WinEvent, ParsedCommandExecution | null>();

/** Parse Event 4103 — Command Execution (Pipeline/Command) */
export function parseCommandExecution(event: WinEvent): ParsedCommandExecution | null {
  if (event.eventId !== 4103) return null;
  if (commandCache.has(event)) return commandCache.get(event)!;

  const dataArray = getDataArray(event);
  if (!dataArray) { commandCache.set(event, null); return null; }

  const contextInfo = getDataField(dataArray, 'ContextInfo');
  const payload = getDataField(dataArray, 'Payload');

  // Parse key = value pairs from ContextInfo block
  const kvPairs = new Map<string, string>();
  for (const line of contextInfo.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key && value) kvPairs.set(key, value);
  }

  const result: ParsedCommandExecution = {
    commandName: kvPairs.get('Command Name') ?? '',
    commandType: kvPairs.get('Command Type') ?? '',
    scriptName: kvPairs.get('Script Name') ?? '',
    user: kvPairs.get('User') ?? '',
    hostApplication: kvPairs.get('Host Application') ?? '',
    payload,
  };

  commandCache.set(event, result);
  return result;
}
