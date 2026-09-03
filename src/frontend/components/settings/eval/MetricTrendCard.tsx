import { TrendingUp, TrendingDown } from 'lucide-react';
import type { MetricTrendPoint } from './eval-types';
import { friendlyMetricName } from './eval-utils';
import { SparklineChart } from './SparklineChart';

interface MetricTrendCardProps {
  metricKey: string;
  points: MetricTrendPoint[];
  color: string;
  /** ISO timestamp of the most recent overall eval run. When provided, the
   *  current-value badge is only shown if this metric was evaluated in that run. */
  latestOverallAt?: string;
}

/** Card showing a metric's current pass rate, point delta, and a sparkline of historical values. */
export function MetricTrendCard({ metricKey, points, color, latestOverallAt }: MetricTrendCardProps) {
  const sorted = [...points].sort(
    (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime(),
  );

  const latest = sorted[sorted.length - 1];
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  // Only show current value if this metric appeared in the latest run.
  // Allow 60 s tolerance for clock skew between agent and Postgres.
  const isFromLatestRun = (() => {
    if (!latestOverallAt || !latest?.completed_at) return true; // no reference — show anyway
    const latestMetricMs = new Date(latest.completed_at).getTime();
    const latestOverallMs = new Date(latestOverallAt).getTime();
    return Math.abs(latestMetricMs - latestOverallMs) <= 60_000;
  })();

  const rate = isFromLatestRun ? latest?.pass_rate : null;
  const pct = rate != null ? Math.round(rate * 100) : null;
  const prevPct = prev?.pass_rate != null ? Math.round(prev.pass_rate * 100) : null;
  const delta = pct != null && prevPct != null ? pct - prevPct : null;

  const isGood = pct != null && pct >= 70;
  const isBad = pct != null && pct < 50;
  const scoreCls = pct == null
    ? 'text-muted-foreground'
    : isGood
      ? 'text-emerald-600 dark:text-emerald-400'
      : isBad
        ? 'text-red-600 dark:text-red-400'
        : 'text-amber-600 dark:text-amber-400';

  const sparkData = sorted
    .map((p) => p.pass_rate)
    .filter((v): v is number => v != null);

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
        {friendlyMetricName(metricKey)}
      </p>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold tabular-nums ${scoreCls}`}>
            {pct != null ? `${pct}%` : '—'}
          </span>
          {delta != null && delta !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                delta > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {delta > 0 ? (
                <><TrendingUp className="w-3.5 h-3.5" /> {delta}pts</>
              ) : (
                <><TrendingDown className="w-3.5 h-3.5" /> {Math.abs(delta)}pts</>
              )}
            </span>
          )}
        </div>
        {sparkData.length >= 2 && <SparklineChart data={sparkData} color={color} />}
      </div>
    </div>
  );
}
