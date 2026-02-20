interface TimeRangePickerProps {
  timeStart: string;
  timeEnd: string;
  onTimeChange: (start: string, end: string) => void;
}

const PRESETS: { label: string; hours: number }[] = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

function getActivePreset(timeStart: string, timeEnd: string): number | null {
  if (timeEnd) return null;
  if (!timeStart) return null;
  const startMs = new Date(timeStart).getTime();
  const nowMs = Date.now();
  const diffH = (nowMs - startMs) / 3600_000;
  for (const p of PRESETS) {
    if (Math.abs(diffH - p.hours) / p.hours < 0.1) return p.hours;
  }
  return null;
}

export default function TimeRangePicker({ timeStart, timeEnd, onTimeChange }: TimeRangePickerProps) {
  const active = getActivePreset(timeStart, timeEnd);

  function selectPreset(hours: number) {
    const start = new Date(Date.now() - hours * 3600_000).toISOString();
    onTimeChange(start, '');
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-200 text-sm font-medium mr-1">Time Range</span>
      <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700">
        {PRESETS.map(p => (
          <button
            key={p.hours}
            onClick={() => selectPreset(p.hours)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              active === p.hours
                ? 'bg-gray-600 text-white font-semibold'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
