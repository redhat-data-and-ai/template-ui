import { Content, Label } from '@patternfly/react-core';
import type { EvalRow } from './eval-types';

interface ScoreHeroProps {
  data: EvalRow;
  prevScore: number | null;
}

/** Displays pass/fail/error counts with an optional trend delta versus the previous run. */
export function ScoreHero({ data, prevScore }: ScoreHeroProps) {
  const score = data.eval_score ?? null;

  const trend = prevScore != null && score != null ? Math.round((score - prevScore) * 100) : null;

  return (
    <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--sm)' }}>
      <div className="app-settings__inline" style={{ flexWrap: 'wrap' }}>
        <Label color="green">{data.pass ?? 0} passed</Label>
        <Label color="red">{data.fail ?? 0} failed</Label>
        {(data.error ?? 0) > 0 && <Label color="orange">{data.error} errors</Label>}
      </div>
      {trend !== null && trend !== 0 && (
        <Content component="small">
          {trend > 0 ? `↑ +${trend}% vs last run` : `↓ ${trend}% vs last run`}
        </Content>
      )}
    </div>
  );
}
