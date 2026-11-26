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
import { Card, CardBody, Content } from '@patternfly/react-core';
import { friendlyMetricName, SERIES_COLORS } from './eval-utils';

/** Formats an axis tick label as time-only when all points share a date, otherwise as a short date. */
function formatTickLabel(iso: string, allSameDay: boolean): string {
  const d = new Date(iso);
  if (allSameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Formats a tooltip label with both date and time for hover detail. */
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

/** Full-width Recharts line chart showing overall and per-metric score trends over time. */
export function TrendChart({ data }: TrendChartProps) {
  if (!data.overall || data.overall.length < 2) {
    return (
      <Card isCompact>
        <CardBody>
          <Content component="p">Need at least 2 eval runs to show trends.</Content>
        </CardBody>
      </Card>
    );
  }

  const colors = SERIES_COLORS;
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
      if (val != null) point[metric] = Math.round(val * 100);
    }
    return point;
  });

  const allKeys = ['Overall', ...metricKeys];
  const gridColor = 'var(--pf-t--global--border--color--default)';
  const axisTickColor = 'var(--pf-t--global--text--color--subtle)';

  return (
    <Card isCompact>
      <CardBody>
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
                border: '1px solid var(--pf-t--global--border--color--default)',
                backgroundColor: 'var(--pf-t--global--background--color--floating--default)',
                color: 'var(--pf-t--global--text--color--regular)',
              }}
              itemStyle={{ color: 'var(--pf-t--global--text--color--regular)' }}
              labelStyle={{ color: 'var(--pf-t--global--text--color--regular)', fontWeight: 600 }}
              labelFormatter={(label: string) => formatTooltipLabel(label)}
              formatter={(value: number, name: string) => [`${value}%`, friendlyMetricName(name)]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value: string) => friendlyMetricName(value)}
            />
            {allKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[i % colors.length]}
                strokeWidth={key === 'Overall' ? 2.5 : 2}
                strokeDasharray={key === 'Overall' ? '6 3' : undefined}
                dot={{ r: 4, strokeWidth: 2, fill: 'var(--pf-t--global--background--color--primary--default)' }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  );
}
