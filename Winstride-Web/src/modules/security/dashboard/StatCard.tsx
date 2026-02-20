import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface StatCardProps {
  title: string;
  value: number;
  sparkline: number[];
  color: string;
  subtitle?: string;
}

export default function StatCard({ title, value, sparkline, color, subtitle }: StatCardProps) {
  const data = sparkline.map((v, i) => ({ i, v }));

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col gap-2 min-w-0">
      <span className="text-gray-200 text-sm font-medium truncate">{title}</span>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-white text-2xl font-bold">{value.toLocaleString()}</span>
          {subtitle && <span className="text-gray-300 text-xs">{subtitle}</span>}
        </div>
        {data.length > 1 && (
          <div className="w-24 h-10 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`grad-${title.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${title.replace(/\s+/g, '-')})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
