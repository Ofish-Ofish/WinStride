import { useState, useEffect } from 'react';
import CollapsibleSection from './CollapsibleSection';
import DualRangeTrack from './DualRangeTrack';
import { injectFilterStyles } from './filterStyles';

/** Dual slider steps — left = furthest back, right = most recent */
const TIME_DUAL_STEPS: { label: string; offset: number }[] = [
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

const MAX_IDX = TIME_DUAL_STEPS.length - 1;

function offsetToIdx(isoStr: string, fallback: number): number {
  if (!isoStr) return fallback;
  const elapsed = Date.now() - new Date(isoStr).getTime();
  let best = fallback;
  let bestDiff = Infinity;
  for (let i = 0; i <= MAX_IDX; i++) {
    const diff = Math.abs(elapsed - TIME_DUAL_STEPS[i].offset);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

export default function TimeDualSlider({
  timeStart,
  timeEnd,
  onTimeStartChange,
  onTimeEndChange,
}: {
  timeStart: string;
  timeEnd: string;
  onTimeStartChange: (v: string) => void;
  onTimeEndChange: (v: string) => void;
}) {
  injectFilterStyles();

  const [startIdx, setStartIdx] = useState(() => offsetToIdx(timeStart, 0));
  const [endIdx, setEndIdx] = useState(() => offsetToIdx(timeEnd, MAX_IDX));

  // Sync from parent on meaningful external changes (preset load, reset)
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
    ? 'All'
    : `${TIME_DUAL_STEPS[startIdx].label} — ${TIME_DUAL_STEPS[endIdx].label}`;

  return (
    <CollapsibleSection
      title="Time Range"
      right={<span className="text-[12px] font-medium text-[#58a6ff]">{displayLabel}</span>}
    >
      <div className="relative h-5">
        <DualRangeTrack minPct={minPct} maxPct={maxPct} />
        <input
          type="range"
          className="gf-slider-dual"
          min={0}
          max={MAX_IDX}
          step={1}
          value={startIdx}
          onChange={(e) => {
            const idx = Math.min(Number(e.target.value), endIdx);
            setStartIdx(idx);
            const step = TIME_DUAL_STEPS[idx];
            onTimeStartChange(step.offset === Infinity ? '' : new Date(Date.now() - step.offset).toISOString());
          }}
        />
        <input
          type="range"
          className="gf-slider-dual"
          min={0}
          max={MAX_IDX}
          step={1}
          value={endIdx}
          onChange={(e) => {
            const idx = Math.max(Number(e.target.value), startIdx);
            setEndIdx(idx);
            const step = TIME_DUAL_STEPS[idx];
            onTimeEndChange(step.offset === 0 ? '' : new Date(Date.now() - step.offset).toISOString());
          }}
        />
      </div>
      <div className="flex justify-between mt-1 px-0.5">
        {TIME_DUAL_STEPS.map((step) => (
          <span key={step.label} className="text-[9px] text-gray-600 select-none">
            {step.label}
          </span>
        ))}
      </div>
    </CollapsibleSection>
  );
}
