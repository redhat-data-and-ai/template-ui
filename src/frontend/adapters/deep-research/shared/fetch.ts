export const DETECT_TIMEOUT_MS = 5_000;
export const REQUEST_TIMEOUT_MS = 30_000;

export function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = DETECT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const signals: AbortSignal[] = [controller.signal];
  if (init?.signal) signals.push(init.signal);

  const merged: RequestInit = {
    ...init,
    signal:
      signals.length > 1 ? AbortSignal.any(signals) : controller.signal,
  };

  return fetch(url, merged).finally(() => clearTimeout(timer));
}
