import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { EvalTrendsResponse } from './eval-types';
import { useDarkMode } from './eval-utils';
import { MetricTrendCard } from './MetricTrendCard';
import { TrendChart } from './TrendChart';

type View = 'cards' | 'chart';

const COLORS_LIGHT = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed'];
const COLORS_DARK = ['#f56e6e', '#4dabf7', '#51cf66', '#ffd43b', '#cc5de8'];

interface MetricTrendsSectionProps {
  data: EvalTrendsResponse;
}

/** Toggleable section rendering metric trends as either sparkline cards or a combined line chart. */
export function MetricTrendsSection({ data }: MetricTrendsSectionProps) {
  const [view, setView] = useState<View>('cards');
  const isDark = useDarkMode();

  const metricKeys = Object.keys(data.metrics);
  const hasMetrics = metricKeys.length > 0;
  const colors = isDark ? COLORS_DARK : COLORS_LIGHT;

  // ISO timestamp of the most recent overall run — used to determine which
  // metric cards should show a "current" value vs. a stale historical one.
  const latestOverallAt = data.overall.length > 0
    ? [...data.overall].sort(
        (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
      )[0].completed_at
    : undefined;

  if (!hasMetrics && (!data.overall || data.overall.length < 2)) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Score Trends
        </p>
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Need at least 2 eval runs to show trends.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Score Trends
        </p>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          <button
            onClick={() => setView('cards')}
            className={cn(
              'px-3 py-1 font-medium transition-colors',
              view === 'cards'
                ? 'bg-primary text-white'
                : 'bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            Cards
          </button>
          <button
            onClick={() => setView('chart')}
            className={cn(
              'px-3 py-1 font-medium transition-colors border-l border-border',
              view === 'chart'
                ? 'bg-primary text-white'
                : 'bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            Chart
          </button>
        </div>
      </div>

      {view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.overall.length > 0 && (
            <MetricTrendCard
              metricKey="Overall"
              points={data.overall.map((p) => ({
                completed_at: p.completed_at,
                pass_rate: p.eval_score,
                score_mean: null,
              }))}
              color={colors[0 % colors.length]}
              latestOverallAt={latestOverallAt}
            />
          )}
          {metricKeys.map((key, i) => (
            <MetricTrendCard
              key={key}
              metricKey={key}
              points={data.metrics[key]}
              color={colors[(i + 1) % colors.length]}
              latestOverallAt={latestOverallAt}
            />
          ))}
        </div>
      ) : (
        <TrendChart data={data} />
      )}
    </div>
  );
}
