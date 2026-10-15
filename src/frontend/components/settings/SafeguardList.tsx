import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { buildAgentApiUrl } from '../../lib/app-paths';

interface Safeguards {
  pii: { enabled: boolean; entities: string[]; trace_strategy: string };
  guardrail: { enabled: boolean };
  token_budget: { enabled: boolean };
}

/**
 * What is applied to a message besides the model.
 *
 * Each of these is silent in the transcript: a redacted input looks
 * like the text you typed, a filtered reply looks like an ordinary
 * one, and a run stopped by the budget looks like a model with
 * little to say. Off is as worth stating as on — "nothing is
 * redacting my input" is the answer people most often assume
 * without checking.
 */
export function SafeguardList() {
  const { t } = useTranslation();
  const [data, setData] = useState<Safeguards | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildAgentApiUrl('/safeguards'), { cache: 'no-store' });
        if (!res.ok) throw new Error(`Could not load safeguards (${res.status})`);
        const body = await res.json();
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load safeguards');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t('common.loading')}
      </p>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const row = (
    key: string,
    title: string,
    detail: string,
    enabled: boolean,
    extra?: React.ReactNode,
  ) => (
    <li key={key} className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
          {extra}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            enabled
              ? 'bg-primary/10 text-primary'
              : 'bg-secondary/60 text-muted-foreground'
          }`}
        >
          {enabled ? t('safeguards.on') : t('safeguards.off')}
        </span>
      </div>
    </li>
  );

  return (
    <ul className="list-none space-y-2 p-0" aria-label={t('safeguards.title')}>
      {row(
        'pii',
        t('safeguards.pii'),
        t('safeguards.piiDetail'),
        data.pii.enabled,
        <>
          {data.pii.entities.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1">
              {data.pii.entities.map((entity) => (
                <code
                  key={entity}
                  className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {entity}
                </code>
              ))}
            </p>
          )}
          {data.pii.trace_strategy && (
            // Said separately because it is a different thing: this
            // governs traces, not what the model is shown.
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('safeguards.traceStrategy', { strategy: data.pii.trace_strategy })}
            </p>
          )}
        </>,
      )}
      {row(
        'guardrail',
        t('safeguards.guardrail'),
        t('safeguards.guardrailDetail'),
        data.guardrail.enabled,
      )}
      {row(
        'budget',
        t('safeguards.tokenBudget'),
        t('safeguards.tokenBudgetDetail'),
        data.token_budget.enabled,
      )}
    </ul>
  );
}
