type AuthRefreshCallback = () => Promise<void>;

let onAuthExpired: AuthRefreshCallback | null = null;

export function setAuthExpiredCallback(cb: AuthRefreshCallback) {
  onAuthExpired = cb;
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
    await onAuthExpired();
    throw new Error('Session expired. Please try again.');
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
    const error = new Error(`Rate limited. Retry after ${retryMs}ms`);
    (error as any).retryAfterMs = retryMs;
    throw error;
  }

  return response;
}
