import { useEffect, useMemo, useState } from 'react';
import type { EvalRow, MetricStats } from './eval-types';
import { ScoreGauge } from './ScoreGauge';
import { ScoreHero } from './ScoreHero';
import { MetricCard } from './MetricCard';
import { ConversationDetailTable } from './ConversationDetailTable';

interface FullReportModalProps {
  result: EvalRow;
  prevScore: number | null;
  onClose: () => void;
}

/** Full-screen modal displaying the complete eval report with metrics, conversations, and tag filtering. */
export function FullReportModal({ result, prevScore, onClose }: FullReportModalProps) {
  const detail = result.results_detail;
  const byMetric = detail?.summary?.summary_stats?.by_metric;
  const byConversation = detail?.summary?.summary_stats?.by_conversation;
  const turns = detail?.turns ?? [];

  const availableTags = [...new Set(turns.map((t) => t.tag).filter((t): t is string => !!t))];
  const [activeTag, setActiveTag] = useState('all');
  const isFiltered = activeTag !== 'all';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const { displayByMetric, displayData, displayScore } = useMemo(() => {
    if (!isFiltered) {
      return {
        displayByMetric: byMetric,
        displayData: result,
        displayScore: result.eval_score,
      };
    }

    const filtered = turns.filter((t) => t.tag === activeTag);
    const metricMap: Record<string, MetricStats> = {};

    for (const t of filtered) {
      const m = t.metric_identifier ?? 'unknown';
      if (!metricMap[m]) metricMap[m] = { pass: 0, fail: 0 };
      const r = (t.result ?? '').toUpperCase();
      if (r === 'PASS') metricMap[m].pass = (metricMap[m].pass ?? 0) + 1;
      else if (r === 'FAIL') metricMap[m].fail = (metricMap[m].fail ?? 0) + 1;
    }
    for (const stats of Object.values(metricMap)) {
      const tot = (stats.pass ?? 0) + (stats.fail ?? 0);
      stats.pass_rate = tot > 0 ? (stats.pass ?? 0) / tot : 0;
    }

    const { dPass, dFail, dError } = filtered.reduce(
      (acc, t) => {
        const r = (t.result ?? '').toUpperCase();
        if (r === 'PASS') acc.dPass++;
        else if (r === 'FAIL') acc.dFail++;
        else acc.dError++;
        return acc;
      },
      { dPass: 0, dFail: 0, dError: 0 },
    );
    const dTotal = dPass + dFail + dError;
    const dScore = dTotal > 0 ? dPass / dTotal : 0;

    return {
      displayByMetric: metricMap,
      displayData: { ...result, pass: dPass, fail: dFail, error: dError, eval_score: dScore },
      displayScore: dScore,
    };
  }, [activeTag, turns, byMetric, result]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-foreground">
            Agent Evaluation Report
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none cursor-pointer"
          >
            &#10005;
          </button>
        </div>
        <div className="overflow-auto p-5 space-y-5">
          <div className="flex items-center gap-4">
            {displayScore != null && <ScoreGauge score={displayScore} />}
            <ScoreHero data={displayData} prevScore={isFiltered ? null : prevScore} />
          </div>

          {displayByMetric && Object.keys(displayByMetric).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Metrics
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(displayByMetric).map(([key, stats]) => (
                  <MetricCard key={key} metricKey={key} stats={stats} />
                ))}
              </div>
            </div>
          )}

          {turns.length > 0 && (
            <ConversationDetailTable
              turns={turns}
              byConversation={byConversation}
              availableTags={availableTags}
              activeTag={activeTag}
              onTagChange={setActiveTag}
            />
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Raw JSON
            </summary>
            <pre className="mt-2 text-xs rounded bg-secondary/30 p-3 overflow-auto max-h-64 text-foreground">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
