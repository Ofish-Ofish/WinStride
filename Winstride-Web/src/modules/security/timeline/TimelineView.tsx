import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../../api/client';
import type { WinEvent, LogonInfo } from '../shared/types';
import { buildODataFilter } from '../shared/buildODataFilter';
import { getDefaultFilters, type GraphFilters } from '../shared/filterTypes';
import { isSystemAccount } from '../shared/eventMeta';
import TimeRangePicker from '../dashboard/TimeRangePicker';
import TimelineChart from '../dashboard/TimelineChart';
import EntityTimelineCard from './EntityTimelineCard';
import { useTimelineData, type EntityMode } from './useTimelineData';
import { ANOMALY_THRESHOLD } from './anomalyDetection';

/** Lightweight logon extraction — same parsing as SecurityMetrics */
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

export default function TimelineView() {
  const [timeStart, setTimeStart] = useState(() => new Date(Date.now() - 24 * 3600_000).toISOString());
  const [timeEnd, setTimeEnd] = useState('');
  const [entityMode, setEntityMode] = useState<EntityMode>('user');
  const [search, setSearch] = useState('');

  const filters = useMemo((): GraphFilters => {
    const f = getDefaultFilters();
    f.timeStart = timeStart;
    f.timeEnd = timeEnd;
    f.eventFilters = new Map();
    return f;
  }, [timeStart, timeEnd]);

  const odataFilter = useMemo(() => buildODataFilter(filters), [filters]);

  const { data: events, isLoading, error } = useQuery<WinEvent[]>({
    queryKey: ['events', 'timeline-view', odataFilter],
    queryFn: () => fetchEvents({
      $filter: odataFilter,
      $select: 'eventId,machineName,timeCreated,eventData',
      $orderby: 'timeCreated desc',
    }),
    refetchInterval: 30_000,
  });

  const logons = useMemo(() => {
    if (!events) return [];
    return parseLogons(events).filter(l => !isSystemAccount(l.targetUserName));
  }, [events]);

  // Derive actual time bounds from data when range is open-ended ("All")
  const dataMinMs = useMemo(() => {
    if (logons.length === 0) return Date.now() - 24 * 3600_000;
    let min = Infinity;
    for (const l of logons) {
      const t = new Date(l.timeCreated).getTime();
      if (t < min) min = t;
    }
    return min;
  }, [logons]);

  const startMs = timeStart ? new Date(timeStart).getTime() : dataMinMs;
  const endMs = timeEnd ? new Date(timeEnd).getTime() : Date.now();

  const { entities, globalBuckets } = useTimelineData(logons, entityMode, startMs, endMs);

  const filteredEntities = useMemo(() => {
    if (!search.trim()) return entities;
    const q = search.toLowerCase();
    return entities.filter(e => e.name.toLowerCase().includes(q));
  }, [entities, search]);

  const anomalousCount = entities.filter(e => e.peakAnomaly >= ANOMALY_THRESHOLD).length;

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[#ff7b72] text-sm">Failed to load events: {(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-h-0 pr-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <TimeRangePicker timeStart={timeStart} timeEnd={timeEnd} onTimeChange={(s, e) => { setTimeStart(s); setTimeEnd(e); }} />
        <div className="flex items-center gap-3 text-xs text-gray-300">
          {isLoading && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#58a6ff] animate-pulse" />
              Loading...
            </span>
          )}
          {!isLoading && events && (
            <span>{events.length.toLocaleString()} events</span>
          )}
          {anomalousCount > 0 && (
            <span className="text-[#ff7b72] font-semibold">
              {anomalousCount} anomalous {entityMode === 'user' ? 'users' : 'machines'}
            </span>
          )}
        </div>
      </div>

      {/* Global overview chart */}
      <TimelineChart data={globalBuckets} />

      {/* Entity controls */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={`Search ${entityMode === 'user' ? 'users' : 'machines'}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#58a6ff]"
          />
        </div>

        {/* User / Machine toggle */}
        <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700">
          <button
            onClick={() => setEntityMode('user')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              entityMode === 'user' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setEntityMode('machine')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              entityMode === 'machine' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Machines
          </button>
        </div>

        {/* Count */}
        <span className="text-xs text-gray-300">
          {filteredEntities.length} {entityMode === 'user' ? 'users' : 'machines'}
        </span>
      </div>

      {/* Entity cards */}
      <div className="flex flex-col gap-2">
        {filteredEntities.map(entity => (
          <EntityTimelineCard key={entity.name} entity={entity} />
        ))}
        {filteredEntities.length === 0 && !isLoading && (
          <div className="text-center text-gray-400 text-sm py-8">
            No {entityMode === 'user' ? 'users' : 'machines'} found
            {search && ` matching "${search}"`}
          </div>
        )}
      </div>
    </div>
  );
}
