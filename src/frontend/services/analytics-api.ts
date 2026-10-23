import { buildAgentApiUrl } from '../lib/app-paths';

export interface AnalyticsSummary {
  window_days: number;
  runs: number;
  threads: number;
  users: number;
  successes: number;
  errors: number;
  in_flight: number;
  /** Runs a pod restart dropped, awaiting recovery. Neither succeeded nor failed. */
  /** Threads a person started through a client. */
  conversations: number;
  interrupted: number;
  /** Non-terminal and past any legitimate duration — a pod died holding them. */
  stale: number;
  /** null when nothing has finished yet — render as "—", never as 0% or 100%. */
  success_rate: number | null;
  p50_seconds: number;
  p95_seconds: number;
  input_tokens: number;
  output_tokens: number;
  /** Subset of input_tokens served from a cached prompt prefix. */
  cached_tokens: number;
  /**
   * null when nothing was recorded, which is not the same as 0%: a
   * provider that reports no cache field and a genuine run of misses
   * look identical, and 0% would be a confident wrong answer.
   */
  cache_hit_rate: number | null;
  feedback_up: number;
  feedback_down: number;
  /** null when nobody has rated anything. */
  satisfaction: number | null;
}

export interface TimeseriesPoint {
  bucket: string;
  runs: number;
  errors: number;
  p95_seconds: number;
}

export interface ModelRow {
  model: string;
  /** Distinct runs that used this model. Sums above the total when runs mix models. */
  runs: number;
  /** Requests to this model — the figure that tracks cost. */
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  p95_seconds: number;
}

export interface ErrorClass {
  class: string;
  count: number;
  last_seen: string | null;
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    let detail = `${fallback} (${response.status})`;
    try {
      const body = await response.json();
      const served = body?.detail ?? body?.message;
      if (served) detail = String(served);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return response.json();
}

/** Coerce to a number, so a missing field never reaches `.toFixed()`. */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** `null` is meaningful here — "not enough data" — so it survives. */
function rate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function fetchSummary(days: number): Promise<AnalyticsSummary> {
  const response = await fetch(buildAgentApiUrl(`/analytics/summary?days=${days}`));
  const body = await json<Partial<AnalyticsSummary>>(response, 'Could not load analytics');
  // Normalised rather than cast. The declared type said these were
  // numbers; a body that disagreed got as far as `p50.toFixed()` and
  // took the page down with it. A type assertion is a promise about
  // data you control, and this is data from the network.
  return {
    window_days: num(body.window_days) || days,
    runs: num(body.runs),
    threads: num(body.threads),
    users: num(body.users),
    successes: num(body.successes),
    errors: num(body.errors),
    in_flight: num(body.in_flight),
    conversations: num(body.conversations),
    interrupted: num(body.interrupted),
    stale: num(body.stale),
    success_rate: rate(body.success_rate),
    p50_seconds: num(body.p50_seconds),
    p95_seconds: num(body.p95_seconds),
    input_tokens: num(body.input_tokens),
    output_tokens: num(body.output_tokens),
    cached_tokens: num(body.cached_tokens),
    cache_hit_rate: rate(body.cache_hit_rate),
    feedback_up: num(body.feedback_up),
    feedback_down: num(body.feedback_down),
    satisfaction: rate(body.satisfaction),
  };
}

export async function fetchTimeseries(
  days: number,
  bucket: 'hour' | 'day' = 'day',
): Promise<TimeseriesPoint[]> {
  const response = await fetch(
    buildAgentApiUrl(`/analytics/timeseries?days=${days}&bucket=${bucket}`),
  );
  const body = await json<{ points?: TimeseriesPoint[] }>(response, 'Could not load trend');
  // Defaulted, not asserted. A 200 whose body is not the shape we
  // expect — a proxy error page, an older agent, a field renamed —
  // otherwise puts `undefined` into state and the next `.map()`
  // takes the whole page down with a blank screen rather than an
  // error message.
  // Numbers coerced too, not just the array. A row missing `runs`
  // makes `Math.max` return NaN and the chart draws nothing; a row
  // missing `p95_seconds` reaches `.toFixed()` and throws.
  return (body.points ?? []).map((pt) => ({
    ...pt,
    runs: num((pt as unknown as Record<string, unknown>).runs),
    p95_seconds: num((pt as unknown as Record<string, unknown>).p95_seconds),
  }));
}

export async function fetchModels(days: number): Promise<ModelRow[]> {
  const response = await fetch(buildAgentApiUrl(`/analytics/models?days=${days}`));
  const body = await json<{ models?: ModelRow[] }>(response, 'Could not load models');
  return (body.models ?? []).map((row) => ({
    ...row,
    runs: num((row as unknown as Record<string, unknown>).runs),
    p95_seconds: num((row as unknown as Record<string, unknown>).p95_seconds),
  }));
}

export async function fetchErrors(days: number): Promise<ErrorClass[]> {
  const response = await fetch(buildAgentApiUrl(`/analytics/errors?days=${days}`));
  const body = await json<{ classes?: ErrorClass[] }>(response, 'Could not load errors');
  return body.classes ?? [];
}
