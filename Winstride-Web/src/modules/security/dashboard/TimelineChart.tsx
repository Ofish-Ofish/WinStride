import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TimeBucket } from './timeUtils';

interface TimelineChartProps {
  data: TimeBucket[];
}

const COLORS = {
  success: '#56d364',
  failed: '#ff7b72',
  logoff: '#79c0ff',
  other: '#8b949e',
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm">
      <p className="text-gray-200 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="text-xs">
          {p.name}: <span className="text-white font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function TimelineChart({ data }: TimelineChartProps) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h3 className="text-[#58a6ff] text-sm font-semibold mb-3">Event Volume Over Time</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey="label" tick={{ fill: '#c9d1d9', fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: '#c9d1d9', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, color: '#c9d1d9' }}
            />
            <Area type="monotone" dataKey="success" name="Success" stackId="1" stroke={COLORS.success} fill={COLORS.success} fillOpacity={0.6} isAnimationActive={false} />
            <Area type="monotone" dataKey="failed"  name="Failed"  stackId="1" stroke={COLORS.failed}  fill={COLORS.failed}  fillOpacity={0.6} isAnimationActive={false} />
            <Area type="monotone" dataKey="logoff"  name="Logoff"  stackId="1" stroke={COLORS.logoff}  fill={COLORS.logoff}  fillOpacity={0.3} isAnimationActive={false} />
            <Area type="monotone" dataKey="other"   name="Other"   stackId="1" stroke={COLORS.other}   fill={COLORS.other}   fillOpacity={0.3} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
