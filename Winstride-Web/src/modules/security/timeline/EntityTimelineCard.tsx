import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart,
  CartesianGrid, Legend,
} from 'recharts';
import type { EntityTimeline } from './useTimelineData';
import { ANOMALY_THRESHOLD } from './anomalyDetection';

const COLORS = {
  success: '#56d364',
  failed: '#ff7b72',
  logoff: '#79c0ff',
  other: '#8b949e',
  anomaly: '#ff7b72',
};

interface Props {
  entity: EntityTimeline;
}

export default function EntityTimelineCard({ entity }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isAnomalous = entity.peakAnomaly >= ANOMALY_THRESHOLD;

  const chartData = useMemo(
    () =>
      entity.buckets.map((b, i) => ({
        label: b.label,
        success: b.success,
        failed: b.failed,
        logoff: b.logoff,
        other: b.other,
        anomaly: Math.max(0, entity.anomalyScores[i] ?? 0),
      })),
    [entity],
  );

  return (
    <div
      className={`bg-gray-800/50 border rounded-lg transition-all cursor-pointer ${
        isAnomalous
          ? 'border-l-2 border-l-red-400 border-red-400/30 shadow-[0_0_12px_rgba(255,123,114,0.15)]'
          : 'border-gray-700 hover:border-gray-600'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0 w-56">
          {isAnomalous && (
            <span className="text-red-400 text-xs font-semibold flex-shrink-0">!!</span>
          )}
          <span className="text-white font-medium text-sm truncate">{entity.name}</span>
          {isAnomalous && (
            <span className="bg-red-400/20 text-red-300 text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0">
              {entity.peakAnomaly.toFixed(1)}
            </span>
          )}
        </div>

        {/* Stats badges */}
        <div className="flex items-center gap-3 text-xs flex-shrink-0">
          <span className="text-gray-300">
            <span className="text-white font-semibold">{entity.totalEvents}</span> events
          </span>
          {entity.failedEvents > 0 && (
            <span className="text-[#ff7b72] font-semibold">
              {entity.failedEvents} failed
            </span>
          )}
          {entity.successEvents > 0 && (
            <span className="text-[#56d364]">
              {entity.successEvents} ok
            </span>
          )}
        </div>

        {/* Mini chart */}
        <div className="flex-1 h-12 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
              <Line type="monotone" dataKey="success" stroke={COLORS.success} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="failed" stroke={COLORS.failed} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              {isAnomalous && (
                <Line type="monotone" dataKey="anomaly" stroke={COLORS.anomaly} strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Expand indicator */}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700">
          <div className="h-56 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis dataKey="label" tick={{ fill: '#c9d1d9', fontSize: 11 }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: '#c9d1d9', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#ff7b72', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1c2128', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#c9d1d9' }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#c9d1d9' }} />
                <Area yAxisId="left" type="monotone" dataKey="success" name="Success" stackId="1" stroke={COLORS.success} fill={COLORS.success} fillOpacity={0.5} isAnimationActive={false} />
                <Area yAxisId="left" type="monotone" dataKey="failed" name="Failed" stackId="1" stroke={COLORS.failed} fill={COLORS.failed} fillOpacity={0.5} isAnimationActive={false} />
                <Area yAxisId="left" type="monotone" dataKey="logoff" name="Logoff" stackId="1" stroke={COLORS.logoff} fill={COLORS.logoff} fillOpacity={0.25} isAnimationActive={false} />
                <Area yAxisId="left" type="monotone" dataKey="other" name="Other" stackId="1" stroke={COLORS.other} fill={COLORS.other} fillOpacity={0.25} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="anomaly" name="Anomaly Score" stroke={COLORS.anomaly} strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
