import { useEffect, useState } from 'react';

function read(query: string, fallback: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback;
  return window.matchMedia(query).matches;
}

/** Live `matchMedia` match. `fallback` applies where matchMedia is unavailable (SSR, jsdom). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() => read(query, fallback));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
