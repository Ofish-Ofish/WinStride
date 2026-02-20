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

/** Parse eventData JSON and return the Data array, or null on failure. */
export function getDataArray(event: WinEvent): unknown[] | null {
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
