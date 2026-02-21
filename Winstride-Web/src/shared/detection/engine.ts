import { useMemo, useCallback } from 'react';
import type { WinEvent } from '../../modules/security/shared/types';
import {
  type Detection,
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

export function runDetections(events: WinEvent[], module: Module): DetectionMap {
  const rules = getRulesForModule(module);
  const multiRules = getMultiEventRulesForModule(module);
  const byEventId = new Map<number, Detection[]>();
  const allSet = new Map<string, Detection>();

  const addDetection = (eventId: number, det: Detection) => {
    let arr = byEventId.get(eventId);
    if (!arr) { arr = []; byEventId.set(eventId, arr); }
    // Avoid duplicate rules on the same event
    if (!arr.some((d) => d.ruleId === det.ruleId)) {
      arr.push(det);
    }
    allSet.set(det.ruleId, det);
  };

  // Single-event rules
  for (const event of events) {
    for (const rule of rules) {
      if (rule.match(event)) {
        addDetection(event.id, {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          mitre: rule.mitre,
          description: rule.description,
        });
      }
    }
  }

  // Multi-event rules
  for (const rule of multiRules) {
    const flaggedIds = rule.matchAll(events);
    if (flaggedIds.size === 0) continue;
    const det: Detection = {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      mitre: rule.mitre,
      description: rule.description,
    };
    for (const id of flaggedIds) {
      addDetection(id, det);
    }
    allSet.set(rule.id, det);
  }

  // Count by severity
  const counts: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const dets of byEventId.values()) {
    for (const d of dets) {
      counts[d.severity]++;
    }
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
/*  React hook                                                         */
/* ------------------------------------------------------------------ */

export function useDetections(events: WinEvent[] | undefined, module: Module): DetectionMap {
  return useMemo(() => {
    if (!events || events.length === 0) {
      return { byEventId: new Map(), all: [], counts: { info: 0, low: 0, medium: 0, high: 0, critical: 0 } };
    }
    return runDetections(events, module);
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
  filterBySeverity: (events: WinEvent[], minSeverity: Severity | null) => WinEvent[];
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
    (evts: WinEvent[], minSeverity: Severity | null) => {
      if (!minSeverity) return evts;
      const minRank = SEVERITY_RANK[minSeverity];
      return evts.filter((e) => {
        const dets = detections.byEventId.get(e.id);
        if (!dets || dets.length === 0) return false;
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

  return { detections, getSortValue, filterBySeverity, getEventSeverity };
}
