import { useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from '../redux/hooks';
import { useRefreshableToken } from '../hooks/useRefreshableToken';
import { loadConfig } from '../redux/slices/config';
import { useTranslation } from 'react-i18next';
import { Alert, Switch } from '@patternfly/react-core';
import { Loader2, SlidersHorizontal } from 'lucide-react';

/** BFF route, not the agent proxy — same shape as config.service. */
function adminApi(path: string): string {
  const basePath = (window.APP_DATA?.basePath || '').replace(/\/$/, '');
  return `${basePath}/api/admin${path}`;
}

interface FeatureState {
  features: Record<string, boolean>;
  overridable: string[];
}

/**
 * Deployment-wide switches, changeable here.
 *
 * Not in Settings, because Settings is per-user preference and these
 * are not: every switch changes what *everybody* sees. Putting them
 * among personal preferences invites someone to flip one thinking it
 * applies to their own account.
 *
 * Values are stored server-side in Redis over the top of
 * `config/ui/settings.yaml`. A per-browser toggle could not do this
 * — it would change what the operator flipping it sees and nobody
 * else.
 */
/** See AnalyticsPage for why `embedded` exists. */
export function AdminPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  // Sent so the agent can authorise this caller the same way it
  // authorises CI. With auth off there is no token and the agent
  // says the dev user is the operator.
  const { token } = useRefreshableToken();
  const [state, setState] = useState<FeatureState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(adminApi('/features'), {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) throw new Error(t('admin.forbidden'));
      if (!res.ok) throw new Error(`Could not load flags (${res.status})`);
      setState(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load flags');
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (key: string, next: boolean) => {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch(adminApi('/features'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // `detail` is the shared key; `error` is this server's older
        // one, still sent alongside it.
        throw new Error(
          body?.detail ?? body?.error ?? `Could not save (${res.status})`,
        );
      }
      const body = await res.json();
      setState((prev) => (prev ? { ...prev, features: body.features } : prev));
      // The tabs read `state.config.features`, which was loaded once
      // at startup. Without this the switch writes to Redis, the
      // server agrees, and the UI keeps showing the old answer until
      // somebody reloads the page.
      void dispatch(loadConfig());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      // Reload rather than keep an optimistic value that did not
      // stick — a switch showing the wrong state is worse than a
      // slow one.
      await load();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={embedded ? '' : 'flex-1 overflow-y-auto px-6 py-6'}>
      <div className={embedded ? '' : 'mx-auto max-w-3xl'}>
        {!embedded && (
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
            {t('admin.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.subtitle')}
          </p>
        </header>
        )}
        {embedded && (
          <p className="mb-4 text-sm text-muted-foreground">
            {t('admin.subtitle')}
          </p>
        )}

        {error && <Alert variant="danger" isInline title={error} className="mb-4" />}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t('common.loading')}
          </p>
        ) : !state ? null : (
          <ul className="list-none space-y-2 p-0" aria-label={t('admin.title')}>
            {state.overridable.map((key) => {
              const on = state.features[key] !== false;
              // Copy lives in the locale files, keyed on the flag
              // name. An unknown flag falls back to its key rather
              // than rendering a missing-translation marker — the
              // allowlist is server-side, so the UI can meet a flag
              // it has no copy for.
              const meta = {
                title: t(`admin.flags.${key}.title`, { defaultValue: key }),
                detail: t(`admin.flags.${key}.detail`, { defaultValue: '' }),
              };
              return (
                <li
                  key={key}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {meta.title}
                    </p>
                    {meta.detail && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {meta.detail}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 pt-0.5">
                    {saving === key ? (
                      <Loader2
                        className="h-4 w-4 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <Switch
                        id={`flag-${key}`}
                        aria-label={meta.title}
                        isChecked={on}
                        onChange={(_e, next) => void toggle(key, next)}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

      </div>
    </div>
  );
}
