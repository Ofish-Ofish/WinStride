import type { WinEvent } from '../../security/shared/types';
import type { ParsedProcessCreate, ParsedNetworkConnect, ParsedFileCreate } from './types';

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

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

/* ------------------------------------------------------------------ */
/*  Parsers                                                            */
/* ------------------------------------------------------------------ */

const processCache = new WeakMap<WinEvent, ParsedProcessCreate | null>();

/** Parse Sysmon Event 1 — Process Creation */
export function parseProcessCreate(event: WinEvent): ParsedProcessCreate | null {
  if (event.eventId !== 1) return null;
  if (processCache.has(event)) return processCache.get(event)!;

  const dataArray = getDataArray(event);
  if (!dataArray) { processCache.set(event, null); return null; }

  const image = getDataField(dataArray, 'Image');
  const parentImage = getDataField(dataArray, 'ParentImage');

  const result: ParsedProcessCreate = {
    image,
    imageName: basename(image),
    commandLine: getDataField(dataArray, 'CommandLine'),
    user: getDataField(dataArray, 'User'),
    processGuid: getDataField(dataArray, 'ProcessGuid'),
    processId: parseInt(getDataField(dataArray, 'ProcessId') || '0', 10),
    parentProcessGuid: getDataField(dataArray, 'ParentProcessGuid'),
    parentImage,
    parentImageName: basename(parentImage),
    parentCommandLine: getDataField(dataArray, 'ParentCommandLine'),
    integrityLevel: getDataField(dataArray, 'IntegrityLevel'),
    hashes: getDataField(dataArray, 'Hashes'),
    currentDirectory: getDataField(dataArray, 'CurrentDirectory'),
    logonId: getDataField(dataArray, 'LogonId'),
  };

  processCache.set(event, result);
  return result;
}

const networkCache = new WeakMap<WinEvent, ParsedNetworkConnect | null>();

/** Parse Sysmon Event 3 — Network Connection */
export function parseNetworkConnect(event: WinEvent): ParsedNetworkConnect | null {
  if (event.eventId !== 3) return null;
  if (networkCache.has(event)) return networkCache.get(event)!;

  const dataArray = getDataArray(event);
  if (!dataArray) { networkCache.set(event, null); return null; }

  const image = getDataField(dataArray, 'Image');

  const result: ParsedNetworkConnect = {
    image,
    imageName: basename(image),
    sourceIp: getDataField(dataArray, 'SourceIp'),
    sourcePort: parseInt(getDataField(dataArray, 'SourcePort') || '0', 10),
    destinationIp: getDataField(dataArray, 'DestinationIp'),
    destinationHostname: getDataField(dataArray, 'DestinationHostname'),
    destinationPort: parseInt(getDataField(dataArray, 'DestinationPort') || '0', 10),
    protocol: getDataField(dataArray, 'Protocol'),
    initiated: getDataField(dataArray, 'Initiated') === 'true',
    user: getDataField(dataArray, 'User'),
    processGuid: getDataField(dataArray, 'ProcessGuid'),
  };

  networkCache.set(event, result);
  return result;
}

const fileCache = new WeakMap<WinEvent, ParsedFileCreate | null>();

/** Parse Sysmon Event 11 — File Creation */
export function parseFileCreate(event: WinEvent): ParsedFileCreate | null {
  if (event.eventId !== 11) return null;
  if (fileCache.has(event)) return fileCache.get(event)!;

  const dataArray = getDataArray(event);
  if (!dataArray) { fileCache.set(event, null); return null; }

  const image = getDataField(dataArray, 'Image');
  const targetFilename = getDataField(dataArray, 'TargetFilename');

  const result: ParsedFileCreate = {
    image,
    imageName: basename(image),
    targetFilename,
    targetBasename: basename(targetFilename),
    user: getDataField(dataArray, 'User'),
    processGuid: getDataField(dataArray, 'ProcessGuid'),
    creationUtcTime: getDataField(dataArray, 'CreationUtcTime'),
  };

  fileCache.set(event, result);
  return result;
}
