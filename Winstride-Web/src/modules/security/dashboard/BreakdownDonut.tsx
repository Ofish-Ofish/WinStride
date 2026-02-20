import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface BreakdownDonutProps {
  title: string;
  data: { name: string; value: number; fill: string }[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm">
      <p className="text-white font-semibold">{d.name}</p>
      <p className="text-gray-300">{d.value.toLocaleString()} events</p>
    </div>
  );
}

export default function BreakdownDonut({ title, data }: BreakdownDonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h3 className="text-[#58a6ff] text-sm font-semibold mb-3">{title}</h3>
      {data.length === 0 ? (
        <p className="text-gray-300 text-sm">No data</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-36 h-36 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.fill} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 min-w-0 overflow-hidden">
            {data.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                <span className="text-gray-200 truncate">{d.name}</span>
                <span className="text-white font-semibold ml-auto flex-shrink-0">
                  {total > 0 ? Math.round(d.value / total * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
