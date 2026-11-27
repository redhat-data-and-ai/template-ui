import { useMemo, useState } from 'react';
import {
  CodeBlock,
  CodeBlockCode,
  ExpandableSection,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  Title,
} from '@patternfly/react-core';
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
  const turns = useMemo(() => detail?.turns ?? [], [detail]);

  const availableTags = [...new Set(turns.map((t) => t.tag).filter((t): t is string => !!t))];
  const [activeTag, setActiveTag] = useState('all');
  const isFiltered = activeTag !== 'all';

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
  }, [activeTag, isFiltered, turns, byMetric, result]);

  return (
    <Modal variant={ModalVariant.large} isOpen onClose={onClose} aria-label="Agent Evaluation Report">
      <ModalHeader title="Agent Evaluation Report" />
      <ModalBody>
        <div className="app-settings__stack">
          <div className="app-settings__inline" style={{ gap: 'var(--pf-t--global--spacer--lg)' }}>
            {displayScore != null && <ScoreGauge score={displayScore} />}
            <ScoreHero data={displayData} prevScore={isFiltered ? null : prevScore} />
          </div>

          {displayByMetric && Object.keys(displayByMetric).length > 0 && (
            <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--sm)' }}>
              <Title headingLevel="h4" size="md">
                Metrics
              </Title>
              <div className="app-settings__theme-grid">
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

          <ExpandableSection toggleText="Raw JSON">
            <CodeBlock>
              <CodeBlockCode>{JSON.stringify(result, null, 2)}</CodeBlockCode>
            </CodeBlock>
          </ExpandableSection>
        </div>
      </ModalBody>
    </Modal>
  );
}
