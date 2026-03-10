import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
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
      queryClient.removeQueries({
        queryKey: ['module-events-poll', filters.logName, prevFilter.current],
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

  // All events flattened from the infinite query cache (single source of truth)
  const events = useMemo(
    () => data?.pages.flatMap((p) => p.events) ?? [],
    [data],
  );

  // Track newest timestamp for polling
  const newestTsRef = useRef('');
  useEffect(() => {
    if (events[0]?.timeCreated) newestTsRef.current = events[0].timeCreated;
  }, [events]);

  // Track known IDs to deduplicate polled events (add incrementally, reset on filter change)
  const knownIdsRef = useRef(new Set<number>());
  const prevEventsLenRef = useRef(0);
  useEffect(() => {
    // On filter change the cache is replaced, so rebuild from scratch
    if (events.length < prevEventsLenRef.current) {
      knownIdsRef.current = new Set(events.map((e) => e.id));
    } else {
      // Only add IDs we haven't seen yet (new events are prepended to page 0)
      for (let i = 0; i < events.length - prevEventsLenRef.current; i++) {
        knownIdsRef.current.add(events[i].id);
      }
    }
    prevEventsLenRef.current = events.length;
  }, [events]);

  const queryKey = useMemo(
    () => ['module-events', filters.logName, odataFilter] as const,
    [filters.logName, odataFilter],
  );

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
    enabled: isComplete && enabled && !paused && !!newestTsRef.current,
    refetchInterval: 2_000,
    retry: 1,
  });

  // Merge polled events directly into the infinite query cache (page 0)
  useEffect(() => {
    const fresh = pollQuery.data?.events;
    if (!fresh || fresh.length === 0) return;
    const newOnes = fresh.filter((e) => !knownIdsRef.current.has(e.id));
    if (newOnes.length === 0) return;

    queryClient.setQueryData<InfiniteData<PagedResponse>>(
      queryKey,
      (old) => {
        if (!old) return old;
        const firstPage = old.pages[0];
        const merged = [...newOnes, ...firstPage.events];
        return {
          ...old,
          pages: [
            { ...firstPage, events: merged },
            ...old.pages.slice(1),
          ],
        };
      },
    );
  }, [pollQuery.data, queryClient, queryKey]);

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
