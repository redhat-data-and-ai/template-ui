import { CheckCircle, Database } from 'lucide-react';
import { buildAppPath } from '../../../lib/app-paths';
import type { ActionState, EvalStatus } from './eval-types';

interface EvalControlsProps {
  onTrigger: (force: boolean) => void;
  isRunning: boolean;
  triggerState: ActionState;
  forceMode: boolean;
  onForceModeChange: (force: boolean) => void;
  hasDataset?: boolean;
}

/** Maps an EvalStatus to a Tailwind text-color class for status messages. */
function statusColor(s: EvalStatus) {
  if (s === 'success') return 'text-emerald-600 dark:text-emerald-400';
  if (s === 'error') return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

/** Toolbar with the Evaluate button, dataset link, force-rerun toggle, and status feedback. */
export function EvalControls({
  onTrigger,
  isRunning,
  triggerState,
  forceMode,
  onForceModeChange,
  hasDataset = false,
}: EvalControlsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => onTrigger(forceMode)}
          disabled={isRunning}
          className="px-5 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {triggerState.status === 'loading' && isRunning ? 'Running…' : 'Evaluate'}
        </button>

        <button
          onClick={() => window.open(buildAppPath('/eval/dataset'), '_blank', 'noopener')}
          aria-label={hasDataset ? 'Dataset (has test cases)' : 'Dataset'}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
        >
          <Database className="w-4 h-4" />
          Dataset
          {hasDataset && (
            <CheckCircle
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          )}
        </button>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground/70 hover:text-foreground transition-colors select-none">
          <input
            type="checkbox"
            checked={forceMode}
            onChange={(e) => onForceModeChange(e.target.checked)}
            disabled={isRunning}
            className="rounded border-border accent-primary"
          />
          Force re-run
        </label>
      </div>

      {triggerState.message && (
        <p className={`text-xs ${statusColor(triggerState.status)}`}>
          {triggerState.message}
        </p>
      )}
    </div>
  );
}
