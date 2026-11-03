import { useEffect, useRef, useState } from 'react';
import { searchThreads, type ThreadSearchHit } from '../services/search-api';

const DEBOUNCE_MS = 250;
/** Below this, a query matches most of the corpus and ranks badly. */
const MIN_QUERY_LENGTH = 3;

export interface ThreadSearchState {
  hits: ThreadSearchHit[];
  loading: boolean;
  error: string | null;
}

/**
 * Debounced server-side thread search.
 *
 * Each keystroke aborts the request in flight. Without that, slow
 * responses arrive out of order and the list flickers back to results
 * for a prefix the user has already typed past.
 */
export function useThreadSearch(query: string): ThreadSearchState {
  const [state, setState] = useState<ThreadSearchState>({
    hits: [],
    loading: false,
    error: null,
  });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    controller.current?.abort();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setState({ hits: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const timer = setTimeout(() => {
      const next = new AbortController();
      controller.current = next;

      searchThreads(trimmed, next.signal)
        .then((response) => setState({ hits: response.results, loading: false, error: null }))
        .catch((error: unknown) => {
          // An abort is this hook working, not a failure to report.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setState({
            hits: [],
            loading: false,
            error: error instanceof Error ? error.message : 'Search failed',
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [query]);

  return state;
}
