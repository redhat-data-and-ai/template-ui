import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Follow a streaming answer, unless the reader is reading something.
 *
 * The chat had two unconditional auto-scrolls — one in the page, one
 * in the message list — and neither asked where the reader was. A
 * token arrives several times a second during a long answer, so
 * scrolling up to re-read anything meant being thrown back to the
 * bottom immediately, over and over, for the length of the reply.
 *
 * The rule is: stay pinned while the reader is at the bottom, stop
 * the moment they leave, resume when they come back. That is how a
 * terminal behaves, and it is what people expect from a transcript
 * that writes itself.
 */

/**
 * Distance from the bottom still counted as "at the bottom".
 *
 * Generous on purpose: a reader who has nudged the wheel one notch
 * has not changed their mind about following along, and a tight
 * threshold makes the stream feel like it keeps giving up.
 */
const PINNED_WITHIN_PX = 80;

export interface StickToBottom {
  /** True while the view is following new content. */
  isPinned: boolean;
  /** Scroll to the newest content and resume following. */
  jumpToBottom: () => void;
}

export function useStickToBottom(
  ref: React.RefObject<HTMLElement | null>,
  /** Changes whenever there is new content to follow. */
  dependency: unknown,
): StickToBottom {
  const [isPinned, setIsPinned] = useState(true);
  // Read during scroll handling, so a ref rather than state: a
  // stale closure here would pin the view against the reader.
  const pinnedRef = useRef(true);

  const setPinned = useCallback((value: boolean) => {
    pinnedRef.current = value;
    setIsPinned(value);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinned(distance <= PINNED_WITHIN_PX);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, setPinned]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !pinnedRef.current) return;
    // Instant, not smooth: a smooth scroll restarted on every token
    // never arrives, and the view crawls behind the text.
    el.scrollTop = el.scrollHeight;
  }, [ref, dependency]);

  const jumpToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setPinned(true);
  }, [ref, setPinned]);

  return { isPinned, jumpToBottom };
}
