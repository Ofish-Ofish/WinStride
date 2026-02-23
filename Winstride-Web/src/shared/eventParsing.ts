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
