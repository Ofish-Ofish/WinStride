import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import type { WinEvent, LogonInfo } from '../shared/types';
import { buildODataFilter } from '../shared/buildODataFilter';
import { getDefaultFilters, type GraphFilters } from '../shared/filterTypes';
import { isSystemAccount } from '../shared/eventMeta';
import { useDashboardStats } from './useDashboardStats';
import { resolveTimeBounds } from './timeUtils';
import TimeRangePicker from './TimeRangePicker';
import StatCard from './StatCard';
import TimelineChart from './TimelineChart';
import TopNBar from './TopNBar';
import BreakdownDonut from './BreakdownDonut';
import FailuresTable from './FailuresTable';

/** Lightweight logon extraction — same parsing as transformEvents but returns flat list */
function parseLogons(events: WinEvent[]): LogonInfo[] {
  const results: LogonInfo[] = [];
  for (const event of events) {
    if (!event.eventData) continue;
    try {
      const parsed = JSON.parse(event.eventData);
      const eventObj = parsed?.Event ?? parsed;
      const dataArray = eventObj?.EventData?.Data;
      if (!dataArray) continue;
      const arr = Array.isArray(dataArray) ? dataArray : [dataArray];

      const get = (name: string): string => {
        for (const item of arr) {
          if (item && typeof item === 'object' && item['@Name'] === name)
            return item['#text'] ?? '';
        }
        return '';
      };

      const targetUserName = get('TargetUserName');
      if (!targetUserName) continue;

      results.push({
        targetUserName,
        targetDomainName: get('TargetDomainName'),
        machineName: event.machineName,
        logonType: parseInt(get('LogonType'), 10) || -1,
        ipAddress: get('IpAddress') || '-',
        ipPort: get('IpPort'),
        timeCreated: event.timeCreated,
        eventId: event.eventId,
        subjectUserName: get('SubjectUserName'),
        subjectDomainName: get('SubjectDomainName'),
        authPackage: get('AuthenticationPackageName'),
        logonProcess: get('LogonProcessName'),
        workstationName: get('WorkstationName'),
        processName: get('ProcessName'),
        keyLength: parseInt(get('KeyLength'), 10) || -1,
        elevatedToken: get('ElevatedToken') === '%%1842',
        failureStatus: get('Status'),
        failureSubStatus: get('SubStatus'),
      });
    } catch { /* skip malformed */ }
  }
  return results;
}

export default function SecurityMetrics() {
  const [timeStart, setTimeStart] = useState(() => new Date(Date.now() - 24 * 3600_000).toISOString());
  const [timeEnd, setTimeEnd] = useState('');

  const filters = useMemo((): GraphFilters => {
    const f = getDefaultFilters();
    f.timeStart = timeStart;
    f.timeEnd = timeEnd;
    // Dashboard shows all event types
    f.eventFilters = new Map();
    return f;
  }, [timeStart, timeEnd]);

  const odataFilter = useMemo(() => buildODataFilter(filters), [filters]);

  const { data: events, isLoading, error } = useQuery<WinEvent[]>({
    queryKey: ['events', 'security-dashboard', odataFilter],
    queryFn: () => fetchEvents({
      $filter: odataFilter,
      $select: 'eventId,machineName,timeCreated,eventData',
      $orderby: 'timeCreated desc',
    }),
    refetchInterval: 30_000,
  });

  const logons = useMemo(() => {
    if (!events) return [];
    const all = parseLogons(events);
    return all.filter(l => !isSystemAccount(l.targetUserName));
  }, [events]);

  const { startMs, endMs } = useMemo(
    () => resolveTimeBounds(logons, timeStart, timeEnd),
    [logons, timeStart, timeEnd],
  );

  const stats = useDashboardStats(logons, startMs, endMs);

  function handleTimeChange(start: string, end: string) {
    setTimeStart(start);
    setTimeEnd(end);
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[#ff7b72] text-sm">Failed to load events: {(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-h-0 pr-1">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <TimeRangePicker timeStart={timeStart} timeEnd={timeEnd} onTimeChange={handleTimeChange} />
        <div className="flex items-center gap-2 text-xs text-gray-300">
          {isLoading && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#58a6ff] animate-pulse" />
              Loading...
            </span>
          )}
          {!isLoading && events && (
            <span>{events.length.toLocaleString()} raw events</span>
          )}
        </div>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Events" value={stats.totalEvents} sparkline={stats.totalSparkline} color="#58a6ff" />
        <StatCard title="Failed Logons" value={stats.failedLogons} sparkline={stats.failedSparkline} color="#ff7b72" />
        <StatCard title="Elevated Sessions" value={stats.elevatedSessions} sparkline={stats.elevatedSparkline} color="#f0a050" />
        <StatCard
          title="Unique Users / Machines"
          value={stats.uniqueUsers}
          sparkline={[]}
          color="#56d364"
          subtitle={`${stats.uniqueUsers} users / ${stats.uniqueMachines} machines`}
        />
      </div>

      {/* Timeline */}
      <TimelineChart data={stats.timeline} />

      {/* Top-N row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TopNBar title="Top Users by Activity" data={stats.topUsers} color="#58a6ff" />
        <TopNBar title="Top Source IPs" data={stats.topIps} color="#79c0ff" />
      </div>

      {/* Donut row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BreakdownDonut title="Logon Type Breakdown" data={stats.logonTypes} />
        <BreakdownDonut title="Auth Method Distribution" data={stats.authMethods} />
      </div>

      {/* Failures table */}
      <FailuresTable data={stats.recentFailures} />
    </div>
  );
}
