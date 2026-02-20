import { useState, useEffect } from 'react';

interface TimeRangePickerProps {
  timeStart: string;
  timeEnd: string;
  onTimeChange: (start: string, end: string) => void;
}

/** Same steps as GraphFilterPanel — left = furthest back, right = most recent */
const STEPS: { label: string; offset: number }[] = [
  { label: 'All', offset: Infinity },
  { label: '30d', offset: 2_592_000_000 },
  { label: '7d',  offset: 604_800_000 },
  { label: '3d',  offset: 259_200_000 },
  { label: '48h', offset: 172_800_000 },
  { label: '24h', offset: 86_400_000 },
  { label: '12h', offset: 43_200_000 },
  { label: '6h',  offset: 21_600_000 },
  { label: '3h',  offset: 10_800_000 },
  { label: '1h',  offset: 3_600_000 },
  { label: '30m', offset: 1_800_000 },
  { label: '15m', offset: 900_000 },
  { label: 'Now', offset: 0 },
];

const MAX_IDX = STEPS.length - 1;

/** Sparse labels to show under the slider (every 3rd + last) */
const VISIBLE_LABELS = STEPS.filter((_, i) => i % 3 === 0 || i === MAX_IDX);

function offsetToIdx(isoStr: string, fallback: number): number {
  if (!isoStr) return fallback;
  const elapsed = Date.now() - new Date(isoStr).getTime();
  let best = fallback;
  let bestDiff = Infinity;
  for (let i = 0; i <= MAX_IDX; i++) {
    const diff = Math.abs(elapsed - STEPS[i].offset);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

function idxToIso(idx: number, isEnd: boolean): string {
  const step = STEPS[idx];
  if (isEnd && step.offset === 0) return '';        // "Now" = open end
  if (!isEnd && step.offset === Infinity) return ''; // "All" = open start
  return new Date(Date.now() - step.offset).toISOString();
}

export default function TimeRangePicker({ timeStart, timeEnd, onTimeChange }: TimeRangePickerProps) {
  // Local index state — avoids round-trip jitter through ISO strings
  const [startIdx, setStartIdx] = useState(() => offsetToIdx(timeStart, 0));
  const [endIdx, setEndIdx] = useState(() => offsetToIdx(timeEnd, MAX_IDX));

  // Sync from parent only on meaningful external changes (e.g., reset filters)
  useEffect(() => {
    const incoming = offsetToIdx(timeStart, 0);
    if (Math.abs(incoming - startIdx) > 1) setStartIdx(incoming);
  }, [timeStart]);

  useEffect(() => {
    const incoming = offsetToIdx(timeEnd, MAX_IDX);
    if (Math.abs(incoming - endIdx) > 1) setEndIdx(incoming);
  }, [timeEnd]);

  const minPct = (startIdx / MAX_IDX) * 100;
  const maxPct = (endIdx / MAX_IDX) * 100;

  const displayLabel = startIdx === 0 && endIdx === MAX_IDX
    ? 'All time'
    : `${STEPS[startIdx].label} — ${STEPS[endIdx].label}`;

  function commitStart(idx: number) {
    const clamped = Math.min(idx, endIdx);
    setStartIdx(clamped);
    onTimeChange(idxToIso(clamped, false), idxToIso(endIdx, true));
  }

  function commitEnd(idx: number) {
    const clamped = Math.max(idx, startIdx);
    setEndIdx(clamped);
    onTimeChange(idxToIso(startIdx, false), idxToIso(clamped, true));
  }

  return (
    <div className="flex items-center gap-4 min-w-0">
      <div className="flex items-center gap-2 flex-shrink-0 w-44">
        <span className="text-gray-200 text-sm font-medium">Time Range</span>
        <span className="text-[#58a6ff] text-xs font-semibold whitespace-nowrap">{displayLabel}</span>
      </div>

      <div className="w-64 flex-shrink-0">
        <div className="relative h-5">
          {/* Background track */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-[#21262d] pointer-events-none">
            <div
              className="h-full rounded-full absolute"
              style={{
                left: `${minPct}%`,
                width: `${Math.max(0, maxPct - minPct)}%`,
                background: 'linear-gradient(90deg, #1f6feb, #58a6ff)',
              }}
            />
          </div>

          {/* Start thumb — z-index higher when near left edge so it stays grabbable */}
          <input
            type="range"
            min={0}
            max={MAX_IDX}
            step={1}
            value={startIdx}
            onChange={(e) => commitStart(Number(e.target.value))}
            style={{ zIndex: startIdx <= MAX_IDX / 2 ? 4 : 3 }}
            className="absolute top-0 left-0 w-full h-5 appearance-none bg-transparent pointer-events-none
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto
              [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-[#58a6ff] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#0d1117]
              [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(88,166,255,0.35)] [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:hover:shadow-[0_0_12px_rgba(88,166,255,0.55)]
              [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent
              [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5
              [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#58a6ff] [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-[#0d1117] [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-none"
          />

          {/* End thumb — z-index higher when near right edge */}
          <input
            type="range"
            min={0}
            max={MAX_IDX}
            step={1}
            value={endIdx}
            onChange={(e) => commitEnd(Number(e.target.value))}
            style={{ zIndex: startIdx <= MAX_IDX / 2 ? 3 : 4 }}
            className="absolute top-0 left-0 w-full h-5 appearance-none bg-transparent pointer-events-none
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto
              [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-[#58a6ff] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#0d1117]
              [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(88,166,255,0.35)] [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:hover:shadow-[0_0_12px_rgba(88,166,255,0.55)]
              [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent
              [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5
              [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#58a6ff] [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-[#0d1117] [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-none"
          />
        </div>

        {/* Step labels */}
        <div className="flex justify-between mt-0.5 px-0.5">
          {VISIBLE_LABELS.map((step) => (
            <span key={step.label} className="text-[9px] text-gray-500 select-none">
              {step.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
