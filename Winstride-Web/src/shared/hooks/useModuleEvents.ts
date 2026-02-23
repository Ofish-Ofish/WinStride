import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { fetchEventsPaged, type PagedResponse } from '../../api/client';
import type { WinEvent } from '../../modules/security/shared/types';
import type { FilterState } from '../../components/filter/filterPrimitives';
import { resolveTriState } from '../../components/filter/filterPrimitives';

const PAGE_SIZE = 500;

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
}

export interface ModuleEventsOptions {
  /** Set false to pause fetching (e.g. when the view is hidden). Default true. */
  enabled?: boolean;
}

export function useModuleEvents(filters: ServerFilters, options?: ModuleEventsOptions): ModuleEventsResult {
  const enabled = options?.enabled ?? true;

  const odataFilter = useMemo(
    () => buildODataFilter(filters),
    [filters.logName, filters.allEventIds, filters.eventFilters, filters.timeStart, filters.timeEnd],
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
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
    refetchInterval: enabled ? 60_000 : false,
    retry: 2,
  });

  // Auto-fetch next page when the previous one completes.
  // Stop if there was an error to avoid infinite retry loops.
  useEffect(() => {
    if (enabled && hasNextPage && !isFetchingNextPage && !error) {
      fetchNextPage();
    }
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage, error]);

  const events = useMemo(
    () => data?.pages.flatMap((p) => p.events) ?? [],
    [data],
  );

  const totalCount = data?.pages[0]?.totalCount ?? null;

  return {
    events,
    isLoading,
    isFetchingMore: isFetchingNextPage,
    isComplete: !hasNextPage && !isLoading,
    totalCount,
    loadedCount: events.length,
    error: error as Error | null,
  };
}
