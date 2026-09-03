import { SparklineChart } from './SparklineChart';
import { friendlyTagName, computeDelta } from './eval-utils';

interface CategoryCardProps {
  tag: string;
  latestScore: number | null;
  passCount: number;
  failCount: number;
  history: number[];
  prevScore?: number | null;
}

/** Displays a category's pass rate, delta from previous run, and a sparkline trend chart. */
export function CategoryCard({
  tag,
  latestScore,
  passCount,
  failCount,
  history,
  prevScore,
}: CategoryCardProps) {
  const pct = latestScore != null ? Math.round(latestScore * 100) : null;
  const isGood = pct === 100;
  const isBad = pct != null && pct < 50;

  const delta =
    prevScore != null && latestScore != null
      ? computeDelta(latestScore, prevScore)
      : null;

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{friendlyTagName(tag)}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {passCount} passed &middot; {failCount} failed
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-lg font-bold tabular-nums ${
              pct == null
                ? 'text-muted-foreground'
                : isGood
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isBad
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-yellow-600 dark:text-yellow-400'
            }`}
          >
            {pct != null ? `${pct}%` : '--'}
          </span>
          {delta && delta.direction !== 'same' && (
            <span
              className={`text-xs font-medium ${
                delta.direction === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {delta.direction === 'up' ? '↑' : '↓'} {delta.value}%
            </span>
          )}
        </div>
      </div>

      {history.length >= 2 && (
        <div className="mt-1">
          <SparklineChart data={history} />
        </div>
      )}

      {history.length < 2 && latestScore == null && (
        <p className="text-xs text-muted-foreground italic mt-1">No data</p>
      )}
    </div>
  );
}
