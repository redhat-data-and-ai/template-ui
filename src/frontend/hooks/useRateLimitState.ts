import { useCallback, useEffect, useRef, useState } from 'react';

import { setRateLimitCallback } from '@/services/authenticated-fetch';

export type RateLimitState = {
  isRateLimited: boolean;
  retryAfterSeconds: number;
  resetTime: Date | null;
};

export { triggerRateLimit } from '@/services/authenticated-fetch';

export function useRateLimitState(): RateLimitState {
  const [state, setState] = useState<RateLimitState>({
    isRateLimited: false,
    retryAfterSeconds: 0,
    resetTime: null,
  });

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (tickRef.current != null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const handleRateLimit = useCallback(
    (retryAfterSeconds: number) => {
      const safe = Math.max(0, Math.floor(retryAfterSeconds));
      clearTick();

      if (safe <= 0) {
        setState({ isRateLimited: false, retryAfterSeconds: 0, resetTime: null });
        return;
      }

      const resetTime = new Date(Date.now() + safe * 1000);
      setState({
        isRateLimited: true,
        retryAfterSeconds: safe,
        resetTime,
      });

      tickRef.current = setInterval(() => {
        setState((prev) => {
          const next = prev.retryAfterSeconds - 1;
          if (next <= 0) {
            clearTick();
            return { isRateLimited: false, retryAfterSeconds: 0, resetTime: null };
          }
          return {
            isRateLimited: true,
            retryAfterSeconds: next,
            resetTime: prev.resetTime,
          };
        });
      }, 1000);
    },
    [clearTick],
  );

  useEffect(() => {
    setRateLimitCallback(handleRateLimit);
    return () => {
      setRateLimitCallback(null);
      clearTick();
    };
  }, [handleRateLimit, clearTick]);

  return state;
}
