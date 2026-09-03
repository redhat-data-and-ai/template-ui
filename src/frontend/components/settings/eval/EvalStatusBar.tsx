import { useEffect, useState } from 'react';

interface EvalStatusBarProps {
  status: string | null;
  score: number | null;
  pass: number;
  fail: number;
  error?: number;
  triggeredAt?: number | null;
  isCached?: boolean;
}

/** Formats elapsed milliseconds into a human-readable duration string (e.g. '2m 15s'). */
function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'error', 'no_dataset']);

/** Colored status banner showing eval progress, completion results, or error state. */
export function EvalStatusBar({ status, score, pass, fail, error = 0, triggeredAt, isCached = false }: EvalStatusBarProps) {
  const [elapsed, setElapsed] = useState('');
  const isRunning = status === 'in_progress' || status === 'not_started';
  const isTerminal = status != null && TERMINAL_STATUSES.has(status);

  useEffect(() => {
    if (!isRunning || !triggeredAt || isTerminal) {
      setElapsed('');
      return;
    }
    const tick = () => setElapsed(formatElapsed(Date.now() - triggeredAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, triggeredAt, isTerminal]);

  if (!status || status === 'unknown') return null;

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
        <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Evaluating…</span>
        {elapsed && <span className="text-xs text-blue-500 dark:text-blue-400 ml-auto">{elapsed}</span>}
      </div>
    );
  }

  if (status === 'completed') {
    const pct = score != null ? Math.round(score * 100) : null;
    const isGood = pct == null || pct >= 70;

    return (
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        isGood
          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30'
          : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
      }`}>
        <span className={`text-sm ${
          isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {isGood ? '✓' : '✗'}
        </span>
        <span className={`text-sm font-medium ${
          isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-700 dark:text-red-300'
        }`}>
          {pct != null ? `${pct}%` : 'Completed'}
        </span>
        <span className="text-xs text-muted-foreground">
          {pass} passed · {fail} failed
          {error > 0 && <span className="text-amber-600 dark:text-amber-400"> · {error} error{error !== 1 ? 's' : ''}</span>}
        </span>
        {isCached && (
          <span className="ml-auto text-xs text-muted-foreground italic">No changes since last run · reusing result</span>
        )}
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2">
        <span className="text-red-600 dark:text-red-400">✗</span>
        <span className="text-sm font-medium text-red-700 dark:text-red-300">Eval failed</span>
        {(pass > 0 || fail > 0 || error > 0) && (
          <span className="text-xs text-muted-foreground">
            {pass} passed · {fail} failed
            {error > 0 && <span className="text-amber-600 dark:text-amber-400"> · {error} error{error !== 1 ? 's' : ''}</span>}
          </span>
        )}
      </div>
    );
  }

  if (status === 'no_dataset') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
        <span className="text-amber-600 dark:text-amber-400">⚠</span>
        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">No dataset configured</span>
        <span className="text-xs text-muted-foreground">Add test cases via the Dataset button to run evaluations.</span>
      </div>
    );
  }

  return null;
}
