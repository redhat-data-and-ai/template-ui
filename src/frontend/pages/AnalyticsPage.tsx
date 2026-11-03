import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, AlertTriangle, Loader2 } from 'lucide-react';
import {
  fetchErrors,
  fetchModels,
  fetchSummary,
  fetchTimeseries,
  type AnalyticsSummary,
  type ErrorClass,
  type ModelRow,
  type TimeseriesPoint,
} from '../services/analytics-api';

const WINDOWS = [1, 7, 30, 90];

/** `null` means "not enough data", which is not the same as zero. */
function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function seconds(value: number): string {
  return value >= 60 ? `${(value / 60).toFixed(1)}m` : `${value.toFixed(1)}s`;
}

/**
 * Operator view: is it used, does it work, how slow, what does it cost.
 *
 * Everything here is aggregate. There is deliberately no way to read
 * anyone's messages from this page — the API does not expose them, and
 * a dashboard is the wrong place to discover that it could.
 */
/**
 * `embedded` drops the page chrome — outer gutter, width cap and the
 * <h1> — because inside a Settings panel the tab label is already the
 * heading and the panel already has its own container. Without it the
 * page renders a title under a title inside a box inside a box.
 */
export function AnalyticsPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [points, setPoints] = useState<TimeseriesPoint[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [errorClasses, setErrorClasses] = useState<ErrorClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (isStale: () => boolean = () => false) => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, m, e] = await Promise.all([
        fetchSummary(days),
        fetchTimeseries(days, days <= 2 ? 'hour' : 'day'),
        fetchModels(days),
        fetchErrors(days),
      ]);
      if (isStale()) return;
      setSummary(s);
      // Array.isArray rather than a truthiness check: `{}` is
      // truthy and still has no `.map`.
      setPoints(Array.isArray(t) ? t : []);
      setModels(Array.isArray(m) ? m : []);
      setErrorClasses(Array.isArray(e) ? e : []);
    } catch (err) {
      if (isStale()) return;
      // Showing zeroes here would be worse than showing nothing: a
      // flat chart reads as "nobody used it", and somebody will act
      // on that.
      setError(err instanceof Error ? err.message : t('analytics.loadFailed'));
      setSummary(null);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [days, t]);

  useEffect(() => {
    // Only the newest window may write. Changing `days` quickly
    // started overlapping loads, and a slower earlier response
    // overwrote the data for the window actually selected.
    let cancelled = false;
    void refresh(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const peak = Math.max(1, ...points.map((p) => p.runs));

  return (
    <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-5xl px-8 py-10'}>
      <header className="mb-10 flex items-start justify-between gap-4">
        {!embedded && (
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Activity className="h-5 w-5" aria-hidden="true" />
              {t('analytics.title')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('analytics.subtitle')}
            </p>
          </div>
        )}
        {embedded && (
          <p className="text-sm text-muted-foreground">{t('analytics.subtitle')}</p>
        )}
        <div className="flex gap-1" role="group" aria-label={t('analytics.window')}>
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              aria-pressed={days === option}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                days === option
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60'
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading && !summary && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      )}

      {summary && (
        <>
          {/* Grouped by the question each answers, not laid out as
              one flat grid of equal boxes. Thirteen identical cards
              gave volume, latency, cost and health the same weight,
              so nothing read as more important than anything else
              and the eye had nowhere to land. Figures that are one
              fact — p50 with p95, tokens in with out, thumbs up with
              down — now share a card instead of being split across
              three. */}
          {/* Conversations leads, with runs beneath it: every figure
              here is client-only, because the agent also serves
              benchmark harnesses, planner steps and subagent calls —
              542 of 553 runs in one window — which would otherwise be
              reported as product usage. */}
          <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Headline
              label={t('analytics.conversations')}
              value={compact(summary.conversations)}
              sub={`${compact(summary.runs)} ${t('analytics.runs').toLowerCase()}`}
            />
            <Headline
              label={t('analytics.people')}
              value={compact(summary.users)}
            />
            <Headline
              label={t('analytics.succeeded')}
              value={pct(summary.success_rate)}
              tone={
                summary.success_rate !== null && summary.success_rate < 95
                  ? 'warn'
                  : undefined
              }
              sub={
                summary.errors > 0
                  ? `${compact(summary.errors)} ${t('analytics.failures').toLowerCase()}`
                  : undefined
              }
            />

            <Panel label={t('analytics.speed')}>
              <Figure label="p50" value={seconds(summary.p50_seconds)} />
              <Figure
                label="p95"
                value={seconds(summary.p95_seconds)}
                tone={summary.p95_seconds > 60 ? 'warn' : undefined}
              />
            </Panel>

            <Panel label={t('analytics.tokens')}>
              <Figure label={t('analytics.tokensIn')} value={compact(summary.input_tokens)} />
              <Figure label={t('analytics.tokensOut')} value={compact(summary.output_tokens)} />
              {/*
                Most input tokens are the system prompt and tool
                schemas, identical on every turn. What share of them
                the provider served from cache is the difference
                between paying for that once an hour and paying for
                it on every message.
              */}
              <Figure label={t('analytics.cached')} value={pct(summary.cache_hit_rate)} />
            </Panel>

            <Panel label={t('analytics.feedback')}>
              <Figure label="👍" value={compact(summary.feedback_up)} />
              <Figure label="👎" value={compact(summary.feedback_down)} />
              <Figure label={t('analytics.ratedGood')} value={pct(summary.satisfaction)} />
            </Panel>
          </div>

          {/* Separate band, because these describe the agent right
              now rather than the window above — and two of them are
              states somebody has to act on. */}
          <Panel label={t('analytics.rightNow')} className="mb-12">
            <Figure label={t('analytics.inFlight')} value={compact(summary.in_flight)} />
            {/* A run stranded by a restart needs the reaper looked
                at; a running one needs nothing. Warn on any, because
                the steady state is zero. */}
            <Figure
              label={t('analytics.interrupted')}
              value={compact(summary.interrupted)}
              tone={summary.interrupted > 0 ? 'warn' : undefined}
            />
            {/* Only when there are any. A permanent "Stale 0" is a
                stat nobody reads, which is how a stat stops being
                noticed when it finally changes. */}
            {summary.stale > 0 && (
              <Figure label={t('analytics.stale')} value={compact(summary.stale)} tone="warn" />
            )}
          </Panel>

          <section className="mb-12">
            {/* The peak beside the title: without a scale a bar's
                height is only a comparison with its neighbours, and
                "the tallest bar" could be nine runs or nine
                thousand. */}
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="text-base font-semibold">{t('analytics.runsOverTime')}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('analytics.peak', { count: peak })}
              </span>
            </div>
            {/* Bars, not a chart library. A quiet day must look like a
                quiet day and not like missing data, so every bucket
                keeps a visible baseline — a zero-height bar is
                indistinguishable from a bucket that was never
                rendered, which is the thing this is trying not to
                say. */}
            <ul className="flex h-40 items-end gap-1 list-none p-0 border-b border-border">
              {points.map((point) => (
                <li
                  key={point.bucket}
                  className="relative flex h-full flex-1 items-end"
                  title={`${point.bucket}: ${point.runs} runs, ${point.errors} errors, p95 ${seconds(point.p95_seconds)}`}
                >
                  <span
                    className={`relative block w-full rounded-sm transition-colors ${
                      point.runs > 0
                        ? 'bg-primary/30 hover:bg-primary/50'
                        : 'bg-border/60'
                    }`}
                    style={{
                      height:
                        point.runs > 0
                          ? `max(3px, ${Math.round((point.runs / peak) * 100)}%)`
                          : '2px',
                    }}
                  >
                    {point.errors > 0 && (
                      <span
                        className="absolute inset-x-0 bottom-0 rounded-sm bg-destructive/80"
                        style={{
                          height: `${Math.round((point.errors / Math.max(1, point.runs)) * 100)}%`,
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>{points[0] ? new Date(points[0].bucket).toLocaleDateString() : ''}</span>
              <span>
                {points.length
                  ? new Date(points[points.length - 1].bucket).toLocaleDateString()
                  : ''}
              </span>
            </p>
          </section>

          <section className="mb-12">
            <h2 className="mb-5 text-base font-semibold">{t('analytics.byModel')}</h2>
            <Table
              head={[t('analytics.model'), t('analytics.runs'), t('analytics.calls'), t('analytics.errors'), 'p95', t('analytics.tokensIn'), t('analytics.tokensOut')]}
              rows={models.map((m) => [
                m.model,
                String(m.runs),
                String(m.calls),
                String(m.errors),
                seconds(m.p95_seconds),
                compact(m.input_tokens),
                compact(m.output_tokens),
              ])}
              empty={t('analytics.noRuns')}
            />
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">{t('analytics.failures')}</h2>
            <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
{t('analytics.failuresNote')}
            </p>
            <Table
              head={[t('analytics.kind'), t('analytics.count'), t('analytics.lastSeen')]}
              rows={errorClasses.map((e) => [
                t(`errorClass.${e.class}`, { defaultValue: e.class }),
                String(e.count),
                e.last_seen ? new Date(e.last_seen).toLocaleString() : '—',
              ])}
              empty={t('analytics.noFailures')}
            />
          </section>
        </>
      )}
    </div>
  );
}

/**
 * A figure that leads: the three a reader looks at first, in a size
 * that says so. `sub` carries the number that qualifies it — runs
 * beneath conversations, failures beneath the success rate — so the
 * qualifier travels with the claim rather than sitting in a box of
 * its own four cards away.
 */
function Headline({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warn';
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold tabular-nums ${
          tone === 'warn' ? 'text-destructive' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** A card holding figures that are one fact — p50 with p95, in with out. */
function Panel({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-card px-5 py-4 ${className}`}
      aria-label={label}
    >
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">{children}</dl>
    </section>
  );
}

/** One labelled number inside a Panel. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 text-xl font-semibold tabular-nums ${
          tone === 'warn' ? 'text-destructive' : 'text-foreground'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          {head.map((cell, index) => (
            // Numbers right-aligned, labels left. A column of figures
            // with ragged right edges cannot be compared by eye, which
            // is the only thing anyone does with this table.
            <th
              key={cell}
              scope="col"
              className={`py-3 pr-4 last:pr-0 font-medium ${index > 0 ? 'text-right' : 'text-left'}`}
            >
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row[0]}
            className="border-b border-border/40 last:border-0 hover:bg-secondary/30"
          >
            {row.map((cell, index) => (
              <td
                key={`${row[0]}-${index}`}
                className={`py-3 pr-4 last:pr-0 ${
                  index > 0
                    ? 'text-right tabular-nums text-muted-foreground'
                    : 'font-medium text-foreground'
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
