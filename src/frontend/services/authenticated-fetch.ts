type AuthExpiredCallback = () => void | Promise<void>;
type RateLimitCallback = (retryAfterSeconds: number) => void | Promise<void>;

let onAuthExpired: AuthExpiredCallback | null = null;
let onRateLimited: RateLimitCallback | null = null;

export function setAuthExpiredCallback(cb: AuthExpiredCallback | null) {
  onAuthExpired = cb;
}

export function setRateLimitCallback(cb: RateLimitCallback | null) {
  onRateLimited = cb;
}

/**
 * Parse `Retry-After` per RFC 7231: delta-seconds or HTTP-date.
 */
export function parseRetryAfterSeconds(header: string | null): number {
  if (header == null || header.trim() === '') {
    return 5;
  }
  const trimmed = header.trim();
  const asInt = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asInt) && String(asInt) === trimmed) {
    return Math.max(0, asInt);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return 5;
}

/**
 * Notify the UI of an active rate limit (e.g. manual trigger or shared with stream layer).
 */
export function triggerRateLimit(retryAfterSeconds: number) {
  void Promise.resolve(onRateLimited?.(retryAfterSeconds));
}

/**
 * Notify the app that the session is no longer valid (e.g. refresh failed).
 * Used by timers or other non-fetch code paths to match authenticatedFetch 401 handling.
 */
export function notifySessionExpired() {
  void Promise.resolve(onAuthExpired?.());
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, { ...init, headers, credentials: 'include' });

  if (response.status === 401 && onAuthExpired) {
    void Promise.resolve(onAuthExpired());
    throw new Error('Session expired. Please try again.');
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retrySeconds = parseRetryAfterSeconds(retryAfterHeader);
    void Promise.resolve(onRateLimited?.(retrySeconds));
    const retryMs = retrySeconds * 1000;
    const error = new Error(`Rate limited. Retry after ${retryMs}ms`);
    (error as Error & { retryAfterMs?: number }).retryAfterMs = retryMs;
    throw error;
  }

  return response;
}
