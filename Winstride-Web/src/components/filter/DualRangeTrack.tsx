export default function DualRangeTrack({ minPct, maxPct }: { minPct: number; maxPct: number }) {
  return (
    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-[#21262d] pointer-events-none">
      <div
        className="h-full rounded-full absolute transition-all duration-75"
        style={{
          left: `${minPct}%`,
          width: `${Math.max(0, maxPct - minPct)}%`,
          background: 'linear-gradient(90deg, #1f6feb, #58a6ff)',
        }}
      />
    </div>
  );
}
