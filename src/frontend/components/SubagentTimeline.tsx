import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, PencilLine } from 'lucide-react';
import {
  formatDuration,
  formatElapsed,
  WRITING,
  type Step,
} from '../lib/subagent-steps';
import { toolLabel } from '../lib/tool-label';

/**
 * What a subagent is doing, as steps rather than prose.
 *
 * The box used to stream the subagent's own text. Wrong content:
 * the report is long, opens with preamble, and the orchestrator
 * relays it in the answer anyway — so the reader got a wall of text
 * twice and still could not tell how far along it was, or whether a
 * two-minute delegation was working or stuck.
 *
 * A step list answers both. Each tool call is a line with a
 * duration; the last line says whether it is still calling things
 * or has started writing.
 */

interface Props {
  steps: ReadonlyArray<Step>;
  /** Unset once the delegation has finished. */
  runningSince?: number;
}

export function SubagentTimeline({ steps, runningSince }: Props) {
  const { t } = useTranslation();

  // A clock that does not tick is worse than no clock: it reads as
  // frozen, which is the exact doubt it exists to answer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (runningSince === undefined) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningSince]);

  if (steps.length === 0) return null;

  return (
    <ol className="space-y-1" data-testid="subagent-timeline">
      {steps.map((step, i) => {
        const running = step.endedAt === undefined;
        const label =
          step.tool === WRITING ? t('subagents.writing') : toolLabel(step.tool);
        const duration = running
          ? runningSince === undefined
            ? undefined
            : now - step.startedAt
          : (step.endedAt as number) - step.startedAt;

        return (
          <li
            key={`${step.tool}-${step.startedAt}-${i}`}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            {running ? (
              step.tool === WRITING ? (
                <PencilLine className="w-3 h-3 shrink-0 text-blue-500" aria-hidden="true" />
              ) : (
                <Loader2
                  className="w-3 h-3 shrink-0 animate-spin text-blue-500"
                  aria-hidden="true"
                />
              )
            ) : (
              <Check className="w-3 h-3 shrink-0 text-green-500" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
            {duration !== undefined && (
              <span className="tabular-nums shrink-0">{formatDuration(duration)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The one line that stays outside the collapse: what it is doing now.
 *
 * The whole step list used to sit out here, so a subagent that made
 * a dozen calls pushed the rest of the conversation off the screen
 * and the reader had to scan a growing list to find the live line.
 * Collapsed, the question is only "what now, and how long" — the
 * history is a click away for anyone who wants it.
 */
export function SubagentCurrentStep({ steps, runningSince }: Props) {
  const { t } = useTranslation();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (runningSince === undefined) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningSince]);

  if (steps.length === 0) return null;

  // The newest open step, else the last thing it finished — several
  // calls can be in flight at once, and the latest is the live one.
  const current =
    [...steps].reverse().find((s) => s.endedAt === undefined) ?? steps[steps.length - 1];
  const running = current.endedAt === undefined;
  const label =
    current.tool === WRITING ? t('subagents.writing') : toolLabel(current.tool);
  const duration = running
    ? runningSince === undefined
      ? undefined
      : now - current.startedAt
    : (current.endedAt as number) - current.startedAt;

  const done = steps.filter((s) => s.endedAt !== undefined).length;

  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="subagent-current-step"
    >
      {running ? (
        current.tool === WRITING ? (
          <PencilLine className="w-3 h-3 shrink-0 text-blue-500" aria-hidden="true" />
        ) : (
          <Loader2 className="w-3 h-3 shrink-0 animate-spin text-blue-500" aria-hidden="true" />
        )
      ) : (
        <Check className="w-3 h-3 shrink-0 text-green-500" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate text-foreground" aria-live="polite">
        {label}
      </span>
      {steps.length > 1 && (
        <span className="tabular-nums shrink-0 opacity-70">
          {done}/{steps.length}
        </span>
      )}
      {duration !== undefined && (
        <span className="tabular-nums shrink-0">{formatDuration(duration)}</span>
      )}
    </div>
  );
}

/** `Working · 0:42`, ticking. */
export function SubagentElapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular-nums">{formatElapsed(now - since)}</span>;
}

export default SubagentTimeline;
