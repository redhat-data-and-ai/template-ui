import React, { useMemo, useState } from 'react';
import type { Turn, ConvStats } from './eval-types';
import { friendlyMetricName, friendlyConversationName, friendlyTagName } from './eval-utils';

interface ConversationDetailTableProps {
  turns: Turn[];
  byConversation?: Record<string, ConvStats>;
  activeTag?: string;
  availableTags?: string[];
  onTagChange?: (tag: string) => void;
}

const TAG_COLORS: Record<string, string> = {
  hitl: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  tool_use: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  non_hitl: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  multi_turn: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

/** Returns Tailwind classes for a tag's badge color, falling back to blue for unknown tags. */
function tagColor(tag: string): string {
  return TAG_COLORS[tag] ?? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
}

/** Renders a per-conversation metrics table grouped by turn, with result badges and scores. */
function TurnTable({ convTurns }: { convTurns: Turn[] }) {
  const byTurn = useMemo(() => {
    const turnIndex = new Map<string, number>();
    const groups: { turnId: string; rows: Turn[] }[] = [];
    for (const t of convTurns) {
      const tid = t.turn_id ?? 'unknown';
      if (!turnIndex.has(tid)) {
        turnIndex.set(tid, groups.length);
        groups.push({ turnId: tid, rows: [] });
      }
      groups[turnIndex.get(tid)!].rows.push(t);
    }
    return groups;
  }, [convTurns]);

  const isMultiTurn = byTurn.length > 1;

  return (
    <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '22%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '54%' }} />
      </colgroup>
      <thead>
        <tr className="border-t border-border bg-secondary/10 text-left text-muted-foreground">
          <th className="px-3 py-2 font-medium">Metric</th>
          <th className="px-3 py-2 font-medium">Result</th>
          <th className="px-3 py-2 font-medium tabular-nums">Score</th>
          <th className="px-3 py-2 font-medium">Reason</th>
        </tr>
      </thead>
      <tbody>
        {byTurn.map(({ turnId, rows }, turnIdx) => (
          <React.Fragment key={turnId}>
            {isMultiTurn && (
              <tr className="border-t border-border bg-secondary/20">
                <td colSpan={4} className="px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {rows[0]?.query
                      ? `Turn ${byTurn.slice(0, turnIdx + 1).filter(g => g.rows[0]?.query).length}`
                      : 'Conversation Level Metric'}
                    {rows[0]?.query && (
                      <span className="ml-2 font-normal normal-case text-muted-foreground/70 truncate max-w-xs inline-block align-bottom">
                        — {rows[0].query.slice(0, 60)}{rows[0].query.length > 60 ? '…' : ''}
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            )}
            {rows.map((turn, i) => {
              const isPass = (turn.result ?? '').toUpperCase() === 'PASS';
              const isFail = (turn.result ?? '').toUpperCase() === 'FAIL';
              return (
                <tr key={`${turnId}-${i}`} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground truncate">
                    {friendlyMetricName(turn.metric_identifier ?? '')}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${
                      isPass
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : isFail
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {turn.result ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-foreground">
                    {turn.score != null ? Number(turn.score).toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground break-words">
                    {turn.reason ?? '—'}
                  </td>
                </tr>
              );
            })}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

/** Expandable accordion of conversations with per-metric turn details and tag-based filtering. */
export function ConversationDetailTable({
  turns,
  byConversation,
  activeTag,
  availableTags = [],
  onTagChange,
}: ConversationDetailTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped: Record<string, Turn[]> = {};
  for (const t of turns) {
    const conv = t.conversation_group_id ?? 'unknown';
    if (!grouped[conv]) grouped[conv] = [];
    grouped[conv].push(t);
  }

  const filteredEntries = Object.entries(grouped).filter(([, convTurns]) => {
    if (!activeTag || activeTag === 'all') return true;
    return convTurns.some((t) => t.tag === activeTag);
  });

  if (filteredEntries.length === 0 && availableTags.length === 0) return null;

  const showChips = availableTags.length > 0 && !!onTagChange;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Conversations
        </p>
        {showChips && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Filter by tag:</span>
            {['all', ...availableTags].map((tag) => (
              <button
                key={tag}
                onClick={() => onTagChange?.(tag)}
                className={`text-xs font-medium px-2.5 py-0.5 rounded-full border transition-colors cursor-pointer ${
                  (activeTag ?? 'all') === tag
                    ? 'bg-primary border-primary text-white'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                }`}
              >
                {tag === 'all' ? 'All' : friendlyTagName(tag)}
              </button>
            ))}
          </div>
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No conversations match this tag.
        </p>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map(([conv, convTurns]) => {
            const isOpen = expanded[conv] ?? true;
            const convStats = byConversation?.[conv];
            const pass = convStats?.pass ?? 0;
            const fail = convStats?.fail ?? 0;
            const total = pass + fail;
            const rate = total > 0 ? Math.round((pass / total) * 100) : null;
            const convTag = convTurns[0]?.tag;

            return (
              <div key={conv} className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [conv]: !isOpen }))}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-secondary/30 hover:bg-secondary/50 text-left cursor-pointer"
                >
                  <span className="text-sm font-semibold text-foreground">
                    {friendlyConversationName(conv)}
                    {convTag && (
                      <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded ${tagColor(convTag)}`}>
                        {friendlyTagName(convTag)}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    {rate != null && (
                      <span className={`text-xs font-semibold ${
                        fail === 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {rate}%
                      </span>
                    )}
                    {total > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pass}/{total} checks
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {isOpen && <TurnTable convTurns={convTurns} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
