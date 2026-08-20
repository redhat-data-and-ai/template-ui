import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import type { EvalTrendsResponse } from './eval-types';
import { friendlyMetricName } from './eval-utils';

const CHART_COLORS_LIGHT = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed'];
const CHART_COLORS_DARK = ['#f56e6e', '#4dabf7', '#51cf66', '#ffd43b', '#cc5de8'];

function getChartColors(): string[] {
  if (typeof document === 'undefined') return CHART_COLORS_LIGHT;
  return document.documentElement.classList.contains('dark')
    ? CHART_COLORS_DARK
    : CHART_COLORS_LIGHT;
}

function formatTickLabel(iso: string, allSameDay: boolean): string {
  const d = new Date(iso);
  if (allSameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTooltipLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface TrendChartProps {
  data: EvalTrendsResponse;
}

export function TrendChart({ data }: TrendChartProps) {
  if (!data.overall || data.overall.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Need at least 2 eval runs to show trends.
        </p>
      </div>
    );
  }

  const colors = getChartColors();
  const metricKeys = Object.keys(data.metrics);

  const timestamps = [...new Set([
    ...data.overall.map(p => p.completed_at),
    ...Object.values(data.metrics).flatMap(pts => pts.map(p => p.completed_at)),
  ])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const allSameDay = timestamps.length > 0 && timestamps.every(ts => {
    const d = new Date(ts);
    const ref = new Date(timestamps[0]);
    return d.getFullYear() === ref.getFullYear()
      && d.getMonth() === ref.getMonth()
      && d.getDate() === ref.getDate();
  });

  const overallMap = new Map(data.overall.map(p => [p.completed_at, p.eval_score]));
  const metricMaps = new Map(
    metricKeys.map(k => [k, new Map(data.metrics[k].map(p => [p.completed_at, p.pass_rate]))])
  );

  const chartData = timestamps.map(ts => {
    const point: Record<string, string | number | null> = { ts };
    const overallVal = overallMap.get(ts);
    if (overallVal != null) point['Overall'] = Math.round(overallVal * 100);

    for (const [metric, map] of metricMaps) {
      const val = map.get(ts);
      if (val != null) point[friendlyMetricName(metric)] = Math.round(val * 100);
    }
    return point;
  });

  const allKeys = ['Overall', ...metricKeys.map(k => friendlyMetricName(k))];
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const axisTickColor = isDark ? '#a1a1aa' : '#71717a';

  return (
    <div>
      <div className="rounded-lg border border-border bg-card p-3">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
            <XAxis
              dataKey="ts"
              tick={{ fontSize: 11, fill: axisTickColor }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => formatTickLabel(v, allSameDay)}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: axisTickColor }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                color: 'var(--foreground)',
              }}
              itemStyle={{ color: 'var(--foreground)' }}
              labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
              labelFormatter={(label: string) => formatTooltipLabel(label)}
              formatter={(value: number, name: string) => [`${value}%`, name]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
            {allKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[i % colors.length]}
                strokeWidth={key === 'Overall' ? 2.5 : 2}
                strokeDasharray={key === 'Overall' ? '6 3' : undefined}
                dot={{ r: 4, strokeWidth: 2, fill: isDark ? '#1e1e2e' : '#ffffff' }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
