import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { buildAgentApiUrl } from '../../lib/app-paths';

interface ModelEntry {
  role: 'orchestrator' | 'subagent';
  name: string;
  provider: string;
  used_by: string;
  inherited?: boolean;
}

interface RoutingTier {
  tier: string;
  name: string;
  provider: string;
  criteria: string;
}

interface Routing {
  enabled: boolean;
  strategy?: string;
  tiers: RoutingTier[];
}

/**
 * Which model answers, and which model each subagent uses.
 *
 * Alongside skills and subagents rather than in Developers: "which
 * model wrote this" is the first thing anyone checks when an answer
 * looks wrong, and it is a property of the agent rather than of the
 * deployment. Endpoints and credentials stay on the operator side —
 * the agent does not serve them here.
 */
export function ModelList() {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [routing, setRouting] = useState<Routing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildAgentApiUrl('/models'), { cache: 'no-store' });
        if (!res.ok) throw new Error(`Could not load models (${res.status})`);
        const body = await res.json();
        if (cancelled) return;
        setModels(Array.isArray(body?.models) ? body.models : []);
        setRouting(body?.routing ?? null);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load models');
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

  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('models.empty')}</p>;
  }

  const orchestrator = models.filter((m) => m.role === 'orchestrator');
  const subagents = models.filter((m) => m.role === 'subagent');

  const row = (model: ModelEntry) => (
    <li
      key={`${model.role}-${model.used_by}`}
      className="rounded-xl border border-border bg-card p-3.5"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <code className="text-sm font-medium text-foreground">{model.name}</code>
        <code className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {model.provider}
        </code>
        {model.inherited && (
          // Worth saying: "chose this model" and "was given the
          // orchestrator's" look identical in a list otherwise.
          <span className="text-[10px] text-muted-foreground">
            {t('models.inherited')}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {model.used_by}
      </p>
    </li>
  );

  return (
    <div className="space-y-6">
      {orchestrator.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {t('models.answering')}
          </h3>
          <ul className="list-none space-y-2 p-0">{orchestrator.map(row)}</ul>
        </section>
      )}

      {subagents.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {t('models.perSubagent')}
          </h3>
          <ul className="list-none space-y-2 p-0">{subagents.map(row)}</ul>
        </section>
      )}

      {routing?.enabled && routing.tiers.length > 0 && (
        <section className="border-t border-border pt-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            {t('models.routing')}
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('models.routingHint')}
          </p>
          <ul className="list-none space-y-2 p-0">
            {routing.tiers.map((tier) => (
              <li
                key={tier.tier}
                className="rounded-xl border border-border bg-card p-3.5"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {tier.tier}
                  </span>
                  <code className="text-sm text-muted-foreground">{tier.name}</code>
                  <code className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {tier.provider}
                  </code>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {tier.criteria}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
