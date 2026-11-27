import { useState } from 'react';
import { Card, CardBody, Content, Title, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import type { EvalTrendsResponse } from './eval-types';
import { SERIES_COLORS } from './eval-utils';
import { MetricTrendCard } from './MetricTrendCard';
import { TrendChart } from './TrendChart';

type View = 'cards' | 'chart';

interface MetricTrendsSectionProps {
  data: EvalTrendsResponse;
}

/** Toggleable section rendering metric trends as either sparkline cards or a combined line chart. */
export function MetricTrendsSection({ data }: MetricTrendsSectionProps) {
  const [view, setView] = useState<View>('cards');

  const metricKeys = Object.keys(data.metrics);
  const hasMetrics = metricKeys.length > 0;
  const colors = SERIES_COLORS;

  // ISO timestamp of the most recent overall run — used to determine which
  // metric cards should show a "current" value vs. a stale historical one.
  const latestOverallAt = data.overall.length > 0
    ? [...data.overall].sort(
        (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
      )[0].completed_at
    : undefined;

  if (!hasMetrics && (!data.overall || data.overall.length < 2)) {
    return (
      <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--sm)' }}>
        <Title headingLevel="h4" size="md">
          Score Trends
        </Title>
        <Card isCompact>
          <CardBody>
            <Content component="p">Need at least 2 eval runs to show trends.</Content>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--md)' }}>
      <div className="app-settings__row">
        <Title headingLevel="h4" size="md">
          Score Trends
        </Title>
        <ToggleGroup aria-label="Trend view">
          <ToggleGroupItem text="Cards" buttonId="trend-view-cards" isSelected={view === 'cards'} onChange={() => setView('cards')} />
          <ToggleGroupItem text="Chart" buttonId="trend-view-chart" isSelected={view === 'chart'} onChange={() => setView('chart')} />
        </ToggleGroup>
      </div>

      {view === 'cards' ? (
        <div className="app-settings__theme-grid">
          {data.overall.length > 0 && (
            <MetricTrendCard
              metricKey="Overall"
              points={data.overall.map((p) => ({
                completed_at: p.completed_at,
                pass_rate: p.eval_score,
                score_mean: null,
              }))}
              color={colors[0 % colors.length]}
              latestOverallAt={latestOverallAt}
            />
          )}
          {metricKeys.map((key, i) => (
            <MetricTrendCard
              key={key}
              metricKey={key}
              points={data.metrics[key]}
              color={colors[(i + 1) % colors.length]}
              latestOverallAt={latestOverallAt}
            />
          ))}
        </div>
      ) : (
        <TrendChart data={data} />
      )}
    </div>
  );
}
