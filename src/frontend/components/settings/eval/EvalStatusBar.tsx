import { useEffect, useState } from 'react';
import { Alert, Spinner } from '@patternfly/react-core';

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

  const counts = (
    <>
      {pass} passed · {fail} failed{error > 0 && ` · ${error} error${error !== 1 ? 's' : ''}`}
    </>
  );

  if (isRunning) {
    return (
      <Alert
        isInline
        variant="info"
        customIcon={<Spinner size="md" aria-hidden="true" />}
        title={elapsed ? `Evaluating… ${elapsed}` : 'Evaluating…'}
      />
    );
  }

  if (status === 'completed') {
    const pct = score != null ? Math.round(score * 100) : null;
    const isGood = pct == null || pct >= 70;
    return (
      <Alert
        isInline
        variant={isGood ? 'success' : 'danger'}
        title={pct != null ? `${pct}%` : 'Completed'}
      >
        {counts}
        {isCached && <em> · No changes since last run, reusing result</em>}
      </Alert>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <Alert isInline variant="danger" title="Eval failed">
        {(pass > 0 || fail > 0 || error > 0) && counts}
      </Alert>
    );
  }

  if (status === 'no_dataset') {
    return (
      <Alert isInline variant="warning" title="No dataset configured">
        Add test cases via the Dataset button to run evaluations.
      </Alert>
    );
  }

  return null;
}
