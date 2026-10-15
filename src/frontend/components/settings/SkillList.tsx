import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { buildAgentApiUrl } from '../../lib/app-paths';
import { SkillSource } from './SkillSource';

interface Skill {
  name: string;
  description: string;
  agents: string[];
  attached: boolean;
}

/**
 * What the agent knows how to do.
 *
 * A skill is the closest thing to a plain-language capability list —
 * "review a merge request", "triage an incident" — and until now the
 * only way to find out was to ask the agent and hope. MCP servers
 * answer *what it is connected to*; this answers *what it does with
 * those connections*.
 *
 * The list shows frontmatter; clicking a row opens the full source.
 * Showing the operating instructions is deliberate — someone deciding
 * whether to trust an answer about a merge request needs to read the
 * rules the agent was following, and a capability list you cannot
 * inspect asks for trust without offering evidence.
 */
export function SkillList() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildAgentApiUrl('/skills'), { cache: 'no-store' });
        if (!res.ok) throw new Error(`Could not load skills (${res.status})`);
        const body = await res.json();
        if (cancelled) return;
        // Defaulted rather than asserted: a 200 whose body is not the
        // shape the type claims — a proxy error page, an older agent
        // — otherwise puts undefined into state and the next .map()
        // blanks the panel instead of showing an error.
        setSkills(Array.isArray(body?.skills) ? body.skills : []);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load skills');
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

  if (skills.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('skills.empty')}</p>;
  }

  return (
    <ul className="list-none space-y-2 p-0" aria-label={t('skills.title')}>
      {skills.map((skill) => (
        <li key={skill.name}>
          {/* The whole row opens the source. A skill is a document;
              making the name a link and the rest inert would hide
              that the description and the rules are one thing. */}
          <button
            type="button"
            onClick={() => setOpen(skill.name)}
            aria-label={t('skills.view', { name: skill.name })}
            className="w-full cursor-pointer rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/30"
          >
          <div className="flex items-baseline justify-between gap-3">
            <code className="text-sm font-medium text-foreground">
              {skill.name}
            </code>
            {/* An unattached skill is a file on disk, not a
                capability. Saying so beats listing it as though the
                agent will use it. */}
            {!skill.attached && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('skills.notAttached')}
              </span>
            )}
          </div>
          {skill.description && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {skill.description}
            </p>
          )}
          {skill.agents.length > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground/80">
              {t('skills.usedBy')} {skill.agents.join(', ')}
            </p>
          )}
          </button>
        </li>
      ))}
      {open && <SkillSource name={open} onClose={() => setOpen(null)} />}
    </ul>
  );
}
