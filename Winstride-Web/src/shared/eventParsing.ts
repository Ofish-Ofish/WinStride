import type { WinEvent } from '../modules/security/shared/types';

/** Extract a named field value from the Data array inside eventData JSON. */
export function getDataField(dataArray: unknown[], fieldName: string): string {
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

/** Cache parsed Data arrays to avoid re-parsing JSON per rule per event. */
const _dataArrayCache = new WeakMap<WinEvent, unknown[] | null>();

/** Cache full parsed event objects for System-level field access. */
const _parsedCache = new WeakMap<WinEvent, Record<string, unknown> | null>();

/** Parse eventData JSON and return the Data array, or null on failure. */
export function getDataArray(event: WinEvent): unknown[] | null {
  const cached = _dataArrayCache.get(event);
  if (cached !== undefined) return cached;

  if (!event.eventData) {
    _dataArrayCache.set(event, null);
    return null;
  }
  try {
    const parsed = JSON.parse(event.eventData);
    const eventObj = parsed?.Event ?? parsed;
    _parsedCache.set(event, eventObj);
    const eventData = eventObj?.EventData;
    if (!eventData) { _dataArrayCache.set(event, null); return null; }
    let dataArray = eventData.Data;
    if (!dataArray) { _dataArrayCache.set(event, null); return null; }
    if (!Array.isArray(dataArray)) dataArray = [dataArray];
    _dataArrayCache.set(event, dataArray);
    return dataArray;
  } catch {
    _dataArrayCache.set(event, null);
    return null;
  }
}

/**
 * Get a System-level field value (e.g., Provider_Name, Channel, Computer).
 * These live in Event.System rather than Event.EventData.Data.
 */
export function getSystemField(event: WinEvent, fieldName: string): string {
  // Ensure parsed cache is populated
  if (!_parsedCache.has(event)) getDataArray(event);
  const eventObj = _parsedCache.get(event);
  if (!eventObj) return '';

  const system = (eventObj as Record<string, unknown>).System as Record<string, unknown> | undefined;
  if (!system) return '';

  // Map Sigma field names to JSON paths in the System section
  switch (fieldName) {
    case 'Provider_Name':
      return String((system.Provider as Record<string, string>)?.['@Name'] ?? '');
    case 'Provider_Guid':
      return String((system.Provider as Record<string, string>)?.['@Guid'] ?? '');
    case 'Channel':
      return String(system.Channel ?? '');
    case 'Computer':
      return String(system.Computer ?? '');
    default:
      return '';
  }
}
