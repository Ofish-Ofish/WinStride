import { useMemo, useCallback, useRef } from 'react';
import type { WinEvent } from '../../modules/security/shared/types';
import {
  type Detection,
  type DetectionRule,
  type Module,
  type Severity,
  getRulesForModule,
  getMultiEventRulesForModule,
} from './rules';

/* ------------------------------------------------------------------ */
/*  Engine — run all rules against events                              */
/* ------------------------------------------------------------------ */

export interface DetectionMap {
  /** Lookup detections by event id */
  byEventId: Map<number, Detection[]>;
  /** All unique detections found */
  all: Detection[];
  /** Count by severity */
  counts: Record<Severity, number>;
}

/* ---- EventId-indexed rule cache ---- */

interface IndexedRules {
  /** Pre-built combined rule lists: eventId-specific + universal */
  combined: Map<number, DetectionRule[]>;
  /** Rules without eventId restriction */
  universal: DetectionRule[];
}

const _indexCache = new Map<Module, IndexedRules>();

function getIndexedRules(module: Module): IndexedRules {
  const cached = _indexCache.get(module);
  if (cached) return cached;

  const rules = getRulesForModule(module);
  const byEventId = new Map<number, DetectionRule[]>();
  const universal: DetectionRule[] = [];

  for (const rule of rules) {
    if (rule.eventIds && rule.eventIds.length > 0) {
      for (const eid of rule.eventIds) {
        let arr = byEventId.get(eid);
        if (!arr) { arr = []; byEventId.set(eid, arr); }
        arr.push(rule);
      }
    } else {
      universal.push(rule);
    }
  }

  // Pre-build combined lists (eventId-specific + universal) — avoids per-event allocation
  const combined = new Map<number, DetectionRule[]>();
  for (const [eid, eidRules] of byEventId) {
    combined.set(eid, universal.length > 0 ? [...eidRules, ...universal] : eidRules);
  }

  const result: IndexedRules = { combined, universal };
  _indexCache.set(module, result);

  const indexed = rules.length - universal.length;
  console.log(`[Sigma] Indexed ${module}: ${indexed} rules by eventId, ${universal.length} universal`);

  return result;
}

/* ---- Core detection runner ---- */

function makeDet(rule: DetectionRule): Detection {
  return { ruleId: rule.id, ruleName: rule.name, severity: rule.severity, mitre: rule.mitre, description: rule.description };
}

/**
 * Run detections on events[startIdx..] and merge with previous results.
 * Pass startIdx=0 and prev=null for a full run.
 */
export function runDetections(
  events: WinEvent[],
  module: Module,
  startIdx = 0,
  prev: DetectionMap | null = null,
): DetectionMap {
  const indexed = getIndexedRules(module);
  const multiRules = getMultiEventRulesForModule(module);

  // Clone previous results (deep-clone inner arrays to avoid mutation)
  const byEventId = new Map<number, Detection[]>();
  const allSet = new Map<string, Detection>();
  if (prev) {
    for (const [k, v] of prev.byEventId) byEventId.set(k, [...v]);
    for (const d of prev.all) allSet.set(d.ruleId, d);
  }

  const addDetection = (eventId: number, det: Detection) => {
    let arr = byEventId.get(eventId);
    if (!arr) { arr = []; byEventId.set(eventId, arr); }
    if (!arr.some((d) => d.ruleId === det.ruleId)) arr.push(det);
    allSet.set(det.ruleId, det);
  };

  // Single-event rules — only process events from startIdx, using eventId index
  for (let i = startIdx; i < events.length; i++) {
    const event = events[i];
    const rules = indexed.combined.get(event.eventId) ?? indexed.universal;
    for (const rule of rules) {
      if (rule.match(event)) {
        addDetection(event.id, makeDet(rule));
      }
    }
  }

  // Multi-event rules — need all events (O(n) sliding window, runs fast)
  for (const rule of multiRules) {
    const flaggedIds = rule.matchAll(events);
    if (flaggedIds.size === 0) continue;
    const det: Detection = { ruleId: rule.id, ruleName: rule.name, severity: rule.severity, mitre: rule.mitre, description: rule.description };
    for (const id of flaggedIds) addDetection(id, det);
  }

  // Count by severity
  const counts: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const dets of byEventId.values()) {
    for (const d of dets) counts[d.severity]++;
  }

  return { byEventId, all: [...allSet.values()], counts };
}

/* ------------------------------------------------------------------ */
/*  Severity helpers                                                   */
/* ------------------------------------------------------------------ */

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function maxSeverity(detections: Detection[]): Severity | null {
  if (detections.length === 0) return null;
  let max: Severity = 'info';
  for (const d of detections) {
    if (SEVERITY_RANK[d.severity] > SEVERITY_RANK[max]) max = d.severity;
  }
  return max;
}

export const SEVERITY_COLORS: Record<Severity, { text: string; bg: string; border: string }> = {
  info:     { text: 'text-gray-300',   bg: 'bg-gray-500/15',    border: 'border-gray-500/30' },
  low:      { text: 'text-[#79c0ff]',  bg: 'bg-[#58a6ff]/15',   border: 'border-[#58a6ff]/30' },
  medium:   { text: 'text-[#f0a050]',  bg: 'bg-[#f0883e]/15',   border: 'border-[#f0883e]/30' },
  high:     { text: 'text-[#ff7b72]',  bg: 'bg-[#f85149]/15',   border: 'border-[#f85149]/30' },
  critical: { text: 'text-[#ff3b30]',  bg: 'bg-[#da3633]/20',   border: 'border-[#da3633]/40' },
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  info: 'Info',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  critical: 'Crit',
};

/* ------------------------------------------------------------------ */
/*  Edge severity helper                                               */
/* ------------------------------------------------------------------ */

export function edgeSeverity(eventIds: number[], detections: DetectionMap): Severity | '' {
  if (eventIds.length === 0) return '';
  const dets: Detection[] = [];
  const seen = new Set<string>();
  for (const eid of eventIds) {
    for (const d of detections.byEventId.get(eid) ?? []) {
      if (!seen.has(d.ruleId)) { seen.add(d.ruleId); dets.push(d); }
    }
  }
  return dets.length > 0 ? (maxSeverity(dets) ?? '') : '';
}

/* ------------------------------------------------------------------ */
/*  React hook — incremental detection                                 */
/* ------------------------------------------------------------------ */

const EMPTY_MAP: DetectionMap = {
  byEventId: new Map(),
  all: [],
  counts: { info: 0, low: 0, medium: 0, high: 0, critical: 0 },
};

export function useDetections(events: WinEvent[] | undefined, module: Module): DetectionMap {
  const cacheRef = useRef<{ module: Module; count: number; map: DetectionMap } | null>(null);

  return useMemo(() => {
    if (!events || events.length === 0) {
      cacheRef.current = null;
      return EMPTY_MAP;
    }

    const cache = cacheRef.current;
    let startIdx = 0;
    let prev: DetectionMap | null = null;

    // Incremental: same module, array grew (batch loading appends events)
    if (cache && cache.module === module && events.length > cache.count) {
      startIdx = cache.count;
      prev = cache.map;
    }

    const result = runDetections(events, module, startIdx, prev);
    cacheRef.current = { module, count: events.length, map: result };
    return result;
  }, [events, module]);
}

/* ------------------------------------------------------------------ */
/*  Integrated severity hook for list views                           */
/* ------------------------------------------------------------------ */

export interface SeverityIntegration {
  detections: DetectionMap;
  /** Pass to VirtualizedEventList.getSortValue */
  getSortValue: (columnKey: string, event: WinEvent) => string | number | undefined;
  /** Filter events by minimum severity — returns input unchanged if minSeverity is null */
  filterBySeverity: (events: WinEvent[], minSeverity: Severity | null, hideUndetected?: boolean) => WinEvent[];
  /** Get severity info for an event (for cell rendering) */
  getEventSeverity: (event: WinEvent) => { severity: Severity; detections: Detection[] } | null;
}

export function useSeverityIntegration(events: WinEvent[] | undefined, module: Module): SeverityIntegration {
  const detections = useDetections(events, module);

  const getSortValue = useCallback(
    (columnKey: string, event: WinEvent) => {
      if (columnKey !== 'severity') return undefined;
      const dets = detections.byEventId.get(event.id);
      if (!dets || dets.length === 0) return -1;
      return SEVERITY_RANK[maxSeverity(dets)!];
    },
    [detections],
  );

  const filterBySeverity = useCallback(
    (evts: WinEvent[], minSeverity: Severity | null, hideUndetected = false) => {
      if (!minSeverity && !hideUndetected) return evts;
      const minRank = minSeverity ? SEVERITY_RANK[minSeverity] : 0;
      return evts.filter((e) => {
        const dets = detections.byEventId.get(e.id);
        if (!dets || dets.length === 0) return !hideUndetected;
        return SEVERITY_RANK[maxSeverity(dets)!] >= minRank;
      });
    },
    [detections],
  );

  const getEventSeverity = useCallback(
    (event: WinEvent) => {
      const dets = detections.byEventId.get(event.id);
      if (!dets || dets.length === 0) return null;
      return { severity: maxSeverity(dets)!, detections: dets };
    },
    [detections],
  );

  return useMemo(
    () => ({ detections, getSortValue, filterBySeverity, getEventSeverity }),
    [detections, getSortValue, filterBySeverity, getEventSeverity],
  );
}
