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

  // Whether the listener has ever been attached, so re-running this
  // effect does not re-measure.
  const measuredRef = useRef(false);

  // `dependency` is in the deps so this re-runs when content arrives.
  // A RefObject keeps the same identity when `ref.current` goes from
  // null to an element, so with only [ref, setPinned] the effect ran
  // once against the loading view, found nothing, and never looked
  // again: scrolling up never unpinned, and every new token dragged
  // the reader back to the bottom.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinned(distance <= PINNED_WITHIN_PX);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    // Measured on first attach only. Re-measuring on every token
    // reads the height *before* the pinned scroll that follows it,
    // which looks like the reader scrolled away and unpins the view
    // — the bug this effect exists to prevent, arriving by the other
    // door.
    if (!measuredRef.current) {
      measuredRef.current = true;
      onScroll();
    }
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, setPinned, dependency]);

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
