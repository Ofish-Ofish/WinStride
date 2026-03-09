import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchEventsPaged, type PagedResponse } from '../../api/client';
import type { WinEvent } from '../../modules/security/shared/types';
import type { FilterState } from '../../components/filter/filterPrimitives';
import { resolveTriState } from '../../components/filter/filterPrimitives';
import { usePollPause } from '../context/PollPauseContext';

const PAGE_SIZE = 2000;

export interface ServerFilters {
  logName: string;
  allEventIds: number[];
  eventFilters: Map<number, FilterState>;
  timeStart: string;
  timeEnd: string;
}

function buildODataFilter(f: ServerFilters): string {
  const parts: string[] = [`logName eq '${f.logName}'`];

  const effectiveIds = resolveTriState(f.allEventIds, f.eventFilters);
  if (effectiveIds.length > 0) {
    const orClauses = effectiveIds.map((id) => `eventId eq ${id}`).join(' or ');
    parts.push(`(${orClauses})`);
  } else {
    parts.push('eventId eq -1');
  }

  if (f.timeStart) {
    const iso = new Date(f.timeStart).toISOString().replace('Z', '+00:00');
    parts.push(`timeCreated gt ${iso}`);
  }
  if (f.timeEnd) {
    const iso = new Date(f.timeEnd).toISOString().replace('Z', '+00:00');
    parts.push(`timeCreated lt ${iso}`);
  }

  return parts.join(' and ');
}

export interface ModuleEventsResult {
  /** All events loaded so far (flattened from all pages) */
  events: WinEvent[];
  /** True while the first page is loading */
  isLoading: boolean;
  /** True while additional pages are being fetched */
  isFetchingMore: boolean;
  /** True when all pages have been fetched */
  isComplete: boolean;
  /** Total count from server (if available) */
  totalCount: number | null;
  /** Number of events loaded so far */
  loadedCount: number;
  /** Error from the query */
  error: Error | null;
  /** Manual refetch trigger */
  refetch: () => void;
  /** True while any fetch (including refetch) is in flight */
  isFetching: boolean;
  /** Number of consecutive failed fetch attempts */
  failureCount: number;
}

export interface ModuleEventsOptions {
  /** Set false to pause fetching (e.g. when the view is hidden). Default true. */
  enabled?: boolean;
}

export function useModuleEvents(filters: ServerFilters, options?: ModuleEventsOptions): ModuleEventsResult {
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();

  const odataFilter = useMemo(
    () => buildODataFilter(filters),
    [filters.logName, filters.allEventIds, filters.eventFilters, filters.timeStart, filters.timeEnd],
  );

  // Remove stale cache entries when the query key changes
  const prevFilter = useRef(odataFilter);
  useEffect(() => {
    if (prevFilter.current !== odataFilter) {
      queryClient.removeQueries({
        queryKey: ['module-events', filters.logName, prevFilter.current],
      });
      prevFilter.current = odataFilter;
    }
  }, [queryClient, filters.logName, odataFilter]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
    isFetching,
    failureCount,
  } = useInfiniteQuery<PagedResponse>({
    queryKey: ['module-events', filters.logName, odataFilter],
    queryFn: ({ pageParam = 0 }) =>
      fetchEventsPaged({
        $filter: odataFilter,
        $select: 'id,eventId,level,machineName,timeCreated,eventData',
        $orderby: 'timeCreated desc',
        $top: String(PAGE_SIZE),
        $skip: String(pageParam),
        $count: 'true',
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.length * PAGE_SIZE;
      if (lastPage.events.length < PAGE_SIZE) return undefined;
      if (lastPage.totalCount !== null && fetched >= lastPage.totalCount) return undefined;
      return fetched;
    },
    enabled,
    retry: 2,
  });

  // Auto-fetch next page when the previous one completes.
  // Stop if there was an error to avoid infinite retry loops.
  useEffect(() => {
    if (enabled && hasNextPage && !isFetchingNextPage && !error) {
      fetchNextPage();
    }
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage, error]);

  // --- Phase 2: Incremental 2s polling (after pagination completes) ---
  const isComplete = !hasNextPage && !isLoading;
  const { paused } = usePollPause();

  // Base events from pagination
  const baseEvents = useMemo(
    () => data?.pages.flatMap((p) => p.events) ?? [],
    [data],
  );

  // Track newest timestamp from base pagination
  const baseNewestTs = baseEvents[0]?.timeCreated ?? '';

  // Accumulate polled events in state so the array only grows
  const [polledEvents, setPolledEvents] = useState<WinEvent[]>([]);
  const knownIdsRef = useRef(new Set<number>());

  // Rebuild known IDs when base pagination data changes
  useEffect(() => {
    const ids = new Set<number>();
    for (const e of baseEvents) ids.add(e.id);
    for (const e of polledEvents) ids.add(e.id);
    knownIdsRef.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseEvents]); // Intentionally omit polledEvents — only rebuild on base data change

  // Newest timestamp across both sources (polled events are prepended, so [0] is newest)
  const newestTsRef = useRef('');
  useEffect(() => {
    newestTsRef.current = polledEvents[0]?.timeCreated ?? baseNewestTs;
  }, [polledEvents, baseNewestTs]);

  // Reset polled events when filters change
  useEffect(() => {
    setPolledEvents([]);
  }, [odataFilter]);

  const pollQuery = useQuery<PagedResponse>({
    queryKey: ['module-events-poll', filters.logName, odataFilter],
    queryFn: () => {
      const ts = newestTsRef.current;
      if (!ts) return { events: [], totalCount: null };
      const iso = new Date(ts).toISOString().replace('Z', '+00:00');
      const pollFilter = `${odataFilter} and timeCreated gt ${iso}`;
      return fetchEventsPaged({
        $filter: pollFilter,
        $select: 'id,eventId,level,machineName,timeCreated,eventData',
        $orderby: 'timeCreated desc',
        $top: '500',
      });
    },
    enabled: isComplete && enabled && !paused && !!baseNewestTs,
    refetchInterval: 2_000,
    retry: 1,
  });

  // Merge poll results into accumulated polled events
  useEffect(() => {
    const fresh = pollQuery.data?.events;
    if (!fresh || fresh.length === 0) return;
    const newOnes = fresh.filter((e) => !knownIdsRef.current.has(e.id));
    if (newOnes.length === 0) return;
    for (const e of newOnes) knownIdsRef.current.add(e.id);
    setPolledEvents((prev) => [...newOnes, ...prev]);
  }, [pollQuery.data]);

  // Final merged array — polled events prepended, array only grows
  const events = useMemo(
    () => (polledEvents.length > 0 ? [...polledEvents, ...baseEvents] : baseEvents),
    [polledEvents, baseEvents],
  );

  const totalCount = data?.pages[0]?.totalCount ?? null;

  return {
    events,
    isLoading,
    isFetchingMore: isFetchingNextPage,
    isComplete,
    totalCount,
    loadedCount: events.length,
    error: error as Error | null,
    refetch,
    isFetching: isFetching || pollQuery.isFetching,
    failureCount,
  };
}
