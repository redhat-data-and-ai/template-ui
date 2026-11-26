import { Card, CardBody, Content, Title } from '@patternfly/react-core';
import type { MetricStats } from './eval-types';
import { friendlyMetricName, scoreTone, toneChartColor, toneTextColor } from './eval-utils';

interface MetricCardProps {
  metricKey: string;
  stats: MetricStats;
  prevStats?: MetricStats;
}

/** Renders a small SVG donut chart showing the pass-rate percentage. */
function MiniDonut({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const cx = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--pf-t--global--border--color--default)" strokeWidth="4" />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={toneChartColor(scoreTone(pct))}
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  );
}

/** Displays a single metric's pass rate with a mini donut chart and pass/total count. */
export function MetricCard({ metricKey, stats }: MetricCardProps) {
  const hasRate = stats.pass_rate != null;
  const rate = hasRate ? stats.pass_rate * (stats.pass_rate <= 1 ? 100 : 1) : null;
  const pct = rate != null ? Math.round(rate) : null;
  const total = (stats.pass ?? 0) + (stats.fail ?? 0);

  return (
    <Card isCompact>
      <CardBody>
        <div className="app-settings__row" style={{ justifyContent: 'flex-start' }}>
          <MiniDonut pct={pct ?? 0} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="app-settings__row">
              <Title headingLevel="h5" size="md" className="app-nav-truncate">
                {friendlyMetricName(metricKey)}
              </Title>
              <strong style={{ color: pct != null ? toneTextColor(scoreTone(pct)) : undefined }}>
                {pct != null ? `${pct}%` : 'N/A'}
              </strong>
            </div>
            <Content component="small">
              {stats.pass ?? 0} of {total} passed
            </Content>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
