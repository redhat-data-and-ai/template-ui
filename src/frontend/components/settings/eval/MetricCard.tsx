import type { MetricStats } from './eval-types';
import { friendlyMetricName } from './eval-utils';

interface MetricCardProps {
  metricKey: string;
  stats: MetricStats;
  prevStats?: MetricStats;
}

/** Renders a small SVG donut chart showing the pass-rate percentage. */
function MiniDonut({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 70 ? '#059669' : pct >= 50 ? '#d97706' : '#ef4444';
  const cx = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border, #e5e7eb)" strokeWidth="4" />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  );
}

/** Displays a single metric's pass rate with a mini donut chart and pass/total count. */
export function MetricCard({ metricKey, stats }: MetricCardProps) {
  const hasRate = stats.pass_rate != null;
  const rate = hasRate
    ? stats.pass_rate * (stats.pass_rate <= 1 ? 100 : 1)
    : null;
  const pct = rate != null ? Math.round(rate) : null;
  const total = (stats.pass ?? 0) + (stats.fail ?? 0);

  const scoreCls = pct == null
    ? 'text-muted-foreground'
    : pct >= 70
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct >= 50
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-center gap-3">
      <MiniDonut pct={pct ?? 0} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {friendlyMetricName(metricKey)}
          </span>
          <span className={`text-sm font-bold tabular-nums shrink-0 ${scoreCls}`}>
            {pct != null ? `${pct}%` : 'N/A'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {stats.pass ?? 0} of {total} passed
        </span>
      </div>
    </div>
  );
}
