import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TopNBarProps {
  title: string;
  data: { name: string; count: number }[];
  color: string;
  onClickItem?: (name: string) => void;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm">
      <p className="text-white font-semibold">{d.name}</p>
      <p className="text-gray-300">{d.count.toLocaleString()} events</p>
    </div>
  );
}

export default function TopNBar({ title, data, color, onClickItem }: TopNBarProps) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h3 className="text-[#58a6ff] text-sm font-semibold mb-3">{title}</h3>
      {data.length === 0 ? (
        <p className="text-gray-300 text-sm">No data</p>
      ) : (
        <div style={{ height: Math.max(data.length * 32, 80) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <XAxis type="number" tick={{ fill: '#c9d1d9', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#e6edf3', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                cursor={onClickItem ? 'pointer' : undefined}
                onClick={onClickItem ? (d: any) => onClickItem(d.name) : undefined}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={color} fillOpacity={1 - i * 0.06} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
