import { useTranslation } from 'react-i18next';

export interface SubagentProgressEntry {
  ns: string;
  node?: string;
  instruction?: string;
  latest?: string;
  agent?: string;
}

interface Props {
  entries: ReadonlyArray<SubagentProgressEntry>;
}

/**
 * What the subagents are doing, while they are doing it.
 *
 * A `task` call is opaque from outside: the orchestrator waits, the
 * subagent works — measured at over a hundred seconds on a
 * three-part question — and the user watches a spinner with no
 * indication that anything is happening or how far along it is.
 *
 * Deliberately a status line, not a transcript. A subagent's
 * internal messages are working notes; the answer is whatever the
 * orchestrator relays at the end, and showing both would read as
 * the agent answering twice.
 */
export function SubagentProgress({ entries }: Props) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  return (
    <div
      className="pl-11 mt-1 space-y-1"
      data-testid="subagent-progress"
      aria-live="polite"
    >
      {entries.map((e) => (
        <div
          key={e.ns}
          className="flex items-start gap-2 text-[11px] text-muted-foreground"
        >
          <span
            className="mt-[3px] h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current"
            aria-hidden="true"
          />
          <span className="min-w-0">
            {/* The instruction identifies which delegation this is —
                the namespace id does not match the parent's
                tool-call id, so it is the only label available when
                two run at once. */}
            <span className="font-medium">
              {e.instruction ? truncate(e.instruction, 70) : t('subagent.working')}
            </span>
            {e.latest ? (
              <span className="opacity-80"> — {truncate(e.latest, 90)}</span>
            ) : e.node ? (
              <span className="opacity-60"> — {e.node}</span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export default SubagentProgress;
