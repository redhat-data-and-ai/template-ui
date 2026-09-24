import type { EvalRow } from './eval-types';

interface ScoreHeroProps {
  data: EvalRow;
  prevScore: number | null;
}

/** Displays pass/fail/error counts with an optional trend delta versus the previous run. */
export function ScoreHero({ data, prevScore }: ScoreHeroProps) {
  const score = data.eval_score ?? null;

  const trend =
    prevScore != null && score != null ? Math.round((score - prevScore) * 100) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          {data.pass ?? 0} passed
        </span>
        <span className="flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          {data.fail ?? 0} failed
        </span>
        {(data.error ?? 0) > 0 && (
          <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            {data.error} errors
          </span>
        )}
      </div>
      {trend !== null && trend !== 0 && (
        <span
          className={`text-xs font-medium ${
            trend > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {trend > 0 ? `↑ +${trend}% vs last run` : `↓ ${trend}% vs last run`}
        </span>
      )}
    </div>
  );
}
