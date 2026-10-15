import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { buildAgentApiUrl } from '../../lib/app-paths';
import { SkillSource } from './SkillSource';

interface Subagent {
  name: string;
  description: string;
  model: string;
  mcps: string[];
  skills: string[];
}

/**
 * The specialists the orchestrator delegates to.
 *
 * Each row leads with its reach — which MCP servers it may call and
 * which skills govern it — because that is the useful thing to know
 * about a subagent. "Investigates incidents" tells you less than
 * "can reach Datadog and GitLab".
 */
export function SubagentList() {
  const { t } = useTranslation();
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildAgentApiUrl('/subagents'), {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Could not load subagents (${res.status})`);
        const body = await res.json();
        if (cancelled) return;
        setSubagents(Array.isArray(body?.subagents) ? body.subagents : []);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load subagents');
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

  if (subagents.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('subagents.empty')}</p>;
  }

  return (
    <ul className="list-none space-y-2 p-0" aria-label={t('subagents.title')}>
      {subagents.map((agent) => (
        <li key={agent.name}>
          <button
            type="button"
            onClick={() => setOpen(agent.name)}
            aria-label={t('subagents.view', { name: agent.name })}
            className="w-full cursor-pointer rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/30"
          >
            <code className="text-sm font-medium text-foreground">
              {agent.name}
            </code>
            {agent.description && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {agent.description}
              </p>
            )}
            {(agent.mcps.length > 0 || agent.skills.length > 0) && (
              <p className="mt-1.5 flex flex-wrap gap-1">
                {[...agent.mcps, ...agent.skills].map((item) => (
                  <code
                    key={item}
                    className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {item}
                  </code>
                ))}
              </p>
            )}
          </button>
        </li>
      ))}
      {open && (
        <SkillSource
          name={open}
          endpoint={`/subagents/${encodeURIComponent(open)}`}
          onClose={() => setOpen(null)}
        />
      )}
    </ul>
  );
}
