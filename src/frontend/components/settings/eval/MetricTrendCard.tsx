import { Card, CardBody, Content, Label } from '@patternfly/react-core';
import { ArrowDownIcon, ArrowUpIcon } from '@patternfly/react-icons';
import type { MetricTrendPoint } from './eval-types';
import { friendlyMetricName, scoreTone, toneTextColor } from './eval-utils';
import { SparklineChart } from './SparklineChart';

interface MetricTrendCardProps {
  metricKey: string;
  points: MetricTrendPoint[];
  color: string;
  /** ISO timestamp of the most recent overall eval run. When provided, the
   *  current-value badge is only shown if this metric was evaluated in that run. */
  latestOverallAt?: string;
}

/** Card showing a metric's current pass rate, point delta, and a sparkline of historical values. */
export function MetricTrendCard({ metricKey, points, color, latestOverallAt }: MetricTrendCardProps) {
  const sorted = [...points].sort(
    (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime(),
  );

  const latest = sorted[sorted.length - 1];
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  // Only show current value if this metric appeared in the latest run.
  // Allow 60 s tolerance for clock skew between agent and Postgres.
  const isFromLatestRun = (() => {
    if (!latestOverallAt || !latest?.completed_at) return true; // no reference — show anyway
    const latestMetricMs = new Date(latest.completed_at).getTime();
    const latestOverallMs = new Date(latestOverallAt).getTime();
    return Math.abs(latestMetricMs - latestOverallMs) <= 60_000;
  })();

  const rate = isFromLatestRun ? latest?.pass_rate : null;
  const pct = rate != null ? Math.round(rate * 100) : null;
  const prevPct = prev?.pass_rate != null ? Math.round(prev.pass_rate * 100) : null;
  const delta = pct != null && prevPct != null ? pct - prevPct : null;

  const tone = pct == null ? null : scoreTone(pct);

  const sparkData = sorted
    .map((p) => p.pass_rate)
    .filter((v): v is number => v != null);

  return (
    <Card isCompact>
      <CardBody>
        <Content component="small" style={{ textTransform: 'uppercase' }}>
          {friendlyMetricName(metricKey)}
        </Content>
        <div className="app-settings__row" style={{ alignItems: 'flex-end' }}>
          <div className="app-settings__inline">
            <strong
              style={{
                fontSize: 'var(--pf-t--global--font--size--2xl)',
                color: tone ? toneTextColor(tone) : undefined,
              }}
            >
              {pct != null ? `${pct}%` : '—'}
            </strong>
            {delta != null && delta !== 0 && (
              <Label isCompact color={delta > 0 ? 'green' : 'red'} icon={delta > 0 ? <ArrowUpIcon /> : <ArrowDownIcon />}>
                {Math.abs(delta)}pts
              </Label>
            )}
          </div>
          {sparkData.length >= 2 && <SparklineChart data={sparkData} color={color} />}
        </div>
      </CardBody>
    </Card>
  );
}
