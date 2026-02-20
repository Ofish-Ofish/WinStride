import { useMemo } from 'react';
import type { LogonInfo } from '../shared/types';
import { bucketEvents, type TimeBucket } from './timeUtils';
import { LOGON_TYPE_LABELS, FAILURE_STATUS_LABELS } from '../shared/eventMeta';

export interface DashboardStats {
  totalEvents: number;
  failedLogons: number;
  elevatedSessions: number;
  uniqueUsers: number;
  uniqueMachines: number;
  totalSparkline: number[];
  failedSparkline: number[];
  elevatedSparkline: number[];
  timeline: TimeBucket[];
  topUsers: { name: string; count: number }[];
  topIps: { name: string; count: number }[];
  logonTypes: { name: string; value: number; fill: string }[];
  authMethods: { name: string; value: number; fill: string }[];
  recentFailures: {
    time: string;
    user: string;
    machine: string;
    ip: string;
    reason: string;
  }[];
}

const DONUT_COLORS = ['#58a6ff', '#56d364', '#ff7b72', '#f0a050', '#79c0ff', '#d2a8ff', '#ffa657', '#8b949e'];

function topN(map: Map<string, number>, n: number): { name: string; count: number }[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

export function useDashboardStats(logons: LogonInfo[], startMs: number, endMs: number): DashboardStats {
  return useMemo(() => {
    const totalEvents = logons.length;
    const failedLogons = logons.filter(l => l.eventId === 4625).length;
    const elevatedSessions = logons.filter(l => l.elevatedToken).length;
    const uniqueUsers = new Set(logons.map(l => l.targetUserName.toLowerCase())).size;
    const uniqueMachines = new Set(logons.map(l => l.machineName.toLowerCase())).size;

    const timeline = bucketEvents(logons, startMs, endMs);

    // Sparklines: last 12 buckets
    const spark = timeline.slice(-12);
    const totalSparkline = spark.map(b => b.success + b.failed + b.logoff + b.other);
    const failedSparkline = spark.map(b => b.failed);
    const elevatedSparkline: number[] = [];
    {
      const interval = timeline.length >= 2
        ? new Date(timeline[1].time).getTime() - new Date(timeline[0].time).getTime()
        : 3600_000;
      const bucketStart = timeline.length > 0 ? new Date(timeline[0].time).getTime() : startMs;
      const sparkStart = Math.max(0, timeline.length - 12);
      const sparkBuckets = new Array(Math.min(12, timeline.length)).fill(0);
      for (const logon of logons) {
        if (!logon.elevatedToken) continue;
        const t = new Date(logon.timeCreated).getTime();
        const idx = Math.floor((t - bucketStart) / interval) - sparkStart;
        if (idx >= 0 && idx < sparkBuckets.length) sparkBuckets[idx]++;
      }
      elevatedSparkline.push(...sparkBuckets);
    }

    const userCounts = new Map<string, number>();
    const ipCounts = new Map<string, number>();
    const ltCounts = new Map<number, number>();
    const authCounts = new Map<string, number>();

    for (const l of logons) {
      userCounts.set(l.targetUserName, (userCounts.get(l.targetUserName) ?? 0) + 1);
      if (l.ipAddress && l.ipAddress !== '-') {
        ipCounts.set(l.ipAddress, (ipCounts.get(l.ipAddress) ?? 0) + 1);
      }
      if (l.logonType >= 0) {
        ltCounts.set(l.logonType, (ltCounts.get(l.logonType) ?? 0) + 1);
      }
      if (l.authPackage) {
        authCounts.set(l.authPackage, (authCounts.get(l.authPackage) ?? 0) + 1);
      }
    }

    const topUsers = topN(userCounts, 10);
    const topIps = topN(ipCounts, 10);

    const logonTypes = Array.from(ltCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lt, value], i) => ({
        name: LOGON_TYPE_LABELS[lt] ?? `Type ${lt}`,
        value,
        fill: DONUT_COLORS[i % DONUT_COLORS.length],
      }));

    const authMethods = Array.from(authCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name: name || 'Unknown',
        value,
        fill: DONUT_COLORS[i % DONUT_COLORS.length],
      }));

    const recentFailures = logons
      .filter(l => l.eventId === 4625)
      .sort((a, b) => b.timeCreated.localeCompare(a.timeCreated))
      .slice(0, 10)
      .map(l => ({
        time: l.timeCreated,
        user: l.targetUserName,
        machine: l.machineName,
        ip: l.ipAddress,
        reason: FAILURE_STATUS_LABELS[l.failureStatus?.toLowerCase()] ?? l.failureStatus ?? 'Unknown',
      }));

    return {
      totalEvents, failedLogons, elevatedSessions, uniqueUsers, uniqueMachines,
      totalSparkline, failedSparkline, elevatedSparkline,
      timeline,
      topUsers, topIps,
      logonTypes, authMethods,
      recentFailures,
    };
  }, [logons, startMs, endMs]);
}
