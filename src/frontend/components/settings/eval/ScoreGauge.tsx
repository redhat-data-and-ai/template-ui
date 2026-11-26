import { scoreTone, toneChartColor } from './eval-utils';

/** Renders a large SVG donut gauge displaying the overall eval score percentage. */
export function ScoreGauge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = toneChartColor(scoreTone(pct));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--pf-t--global--border--color--default)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="70" y="67" textAnchor="middle" fontSize="26" fontWeight="700" fill={color}>
          {pct}%
        </text>
        <text x="70" y="87" textAnchor="middle" fontSize="11" fill="var(--pf-t--global--text--color--subtle)">
          overall
        </text>
      </svg>
    </div>
  );
}
