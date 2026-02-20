import type { LogonInfo } from '../shared/types';

export interface TimeBucket {
  time: string;      // ISO string of bucket start
  label: string;     // display label like "14:00" or "Feb 12"
  success: number;
  failed: number;
  logoff: number;
  other: number;
}

/**
 * Choose bucket interval based on the time span.
 * <=6h → 15min, <=24h → 1h, <=7d → 6h, >7d → 1d
 */
export function pickInterval(startMs: number, endMs: number): number {
  const span = endMs - startMs;
  if (span <= 6 * 3600_000) return 15 * 60_000;       // 15 min
  if (span <= 24 * 3600_000) return 3600_000;          // 1 hour
  if (span <= 7 * 86_400_000) return 6 * 3600_000;     // 6 hours
  return 86_400_000;                                    // 1 day
}

function formatLabel(date: Date, intervalMs: number): string {
  if (intervalMs < 86_400_000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function bucketEvents(logons: LogonInfo[], startMs: number, endMs: number): TimeBucket[] {
  const interval = pickInterval(startMs, endMs);
  const bucketStart = Math.floor(startMs / interval) * interval;
  const bucketEnd = Math.ceil(endMs / interval) * interval;

  const buckets: TimeBucket[] = [];
  for (let t = bucketStart; t < bucketEnd; t += interval) {
    const d = new Date(t);
    buckets.push({
      time: d.toISOString(),
      label: formatLabel(d, interval),
      success: 0, failed: 0, logoff: 0, other: 0,
    });
  }

  for (const logon of logons) {
    const t = new Date(logon.timeCreated).getTime();
    const idx = Math.floor((t - bucketStart) / interval);
    if (idx < 0 || idx >= buckets.length) continue;
    const b = buckets[idx];
    if (logon.eventId === 4625) b.failed++;
    else if (logon.eventId === 4624) b.success++;
    else if (logon.eventId === 4634 || logon.eventId === 4647) b.logoff++;
    else b.other++;
  }

  return buckets;
}
