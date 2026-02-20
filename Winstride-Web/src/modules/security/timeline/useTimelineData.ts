import { useMemo } from 'react';
import type { LogonInfo } from '../shared/types';
import { bucketEvents, type TimeBucket } from '../dashboard/timeUtils';
import { detectAnomalies, maxAnomaly } from './anomalyDetection';

export type EntityMode = 'user' | 'machine';

export interface EntityTimeline {
  name: string;
  mode: EntityMode;
  totalEvents: number;
  failedEvents: number;
  successEvents: number;
  buckets: TimeBucket[];
  anomalyScores: number[];
  peakAnomaly: number;
}

function groupByEntity(logons: LogonInfo[], mode: EntityMode): Map<string, LogonInfo[]> {
  const map = new Map<string, LogonInfo[]>();
  for (const l of logons) {
    const key = mode === 'user' ? l.targetUserName : l.machineName;
    if (!key || key === '-') continue;
    const arr = map.get(key);
    if (arr) arr.push(l);
    else map.set(key, [l]);
  }
  return map;
}

export function useTimelineData(
  logons: LogonInfo[],
  mode: EntityMode,
  startMs: number,
  endMs: number,
): { entities: EntityTimeline[]; globalBuckets: TimeBucket[] } {
  return useMemo(() => {
    const globalBuckets = bucketEvents(logons, startMs, endMs);
    const grouped = groupByEntity(logons, mode);

    const entities: EntityTimeline[] = [];
    for (const [name, entityLogons] of grouped) {
      const buckets = bucketEvents(entityLogons, startMs, endMs);
      const totalCounts = buckets.map(b => b.success + b.failed + b.logoff + b.other);
      const anomalyScores = detectAnomalies(totalCounts);

      entities.push({
        name,
        mode,
        totalEvents: entityLogons.length,
        failedEvents: entityLogons.filter(l => l.eventId === 4625).length,
        successEvents: entityLogons.filter(l => l.eventId === 4624).length,
        buckets,
        anomalyScores,
        peakAnomaly: maxAnomaly(anomalyScores),
      });
    }

    // Sort: most anomalous first, then by total events
    entities.sort((a, b) => b.peakAnomaly - a.peakAnomaly || b.totalEvents - a.totalEvents);

    return { entities, globalBuckets };
  }, [logons, mode, startMs, endMs]);
}
