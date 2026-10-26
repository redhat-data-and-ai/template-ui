import { act, render } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useStickToBottom } from './useStickToBottom';

/**
 * The transcript used to scroll unconditionally on every message
 * change — several times a second during a long answer — from two
 * places at once. Scrolling up to re-read anything threw the reader
 * back to the bottom, repeatedly, for the length of the reply.
 */
function Harness({ onState }: { onState: (s: { isPinned: boolean }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dep, setDep] = useState(0);
  const { isPinned, jumpToBottom } = useStickToBottom(ref, dep);
  onState({ isPinned });
  return (
    <div>
      <div ref={ref} data-testid="scroller" style={{ height: 100, overflow: 'auto' }}>
        <div style={{ height: 1000 }} />
      </div>
      <button onClick={() => setDep((d) => d + 1)}>tick</button>
      <button onClick={jumpToBottom}>jump</button>
    </div>
  );
}

function setGeometry(el: HTMLElement, scrollTop: number) {
  Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 100, configurable: true });
  el.scrollTop = scrollTop;
}

describe('useStickToBottom', () => {
  it('starts pinned', () => {
    let state = { isPinned: false };
    render(<Harness onState={(s) => (state = s)} />);
    expect(state.isPinned).toBe(true);
  });

  it('unpins when the reader scrolls up', () => {
    let state = { isPinned: true };
    const { getByTestId } = render(<Harness onState={(s) => (state = s)} />);
    const el = getByTestId('scroller');
    setGeometry(el, 100);
    act(() => el.dispatchEvent(new Event('scroll')));
    expect(state.isPinned).toBe(false);
  });

  it('stays pinned for a small nudge', () => {
    // A reader who moved the wheel one notch has not changed their
    // mind; a tight threshold makes the stream feel like it keeps
    // giving up.
    let state = { isPinned: true };
    const { getByTestId } = render(<Harness onState={(s) => (state = s)} />);
    const el = getByTestId('scroller');
    setGeometry(el, 880); // 20px from the bottom
    act(() => el.dispatchEvent(new Event('scroll')));
    expect(state.isPinned).toBe(true);
  });

  it('re-pins when the reader returns to the bottom', () => {
    let state = { isPinned: true };
    const { getByTestId } = render(<Harness onState={(s) => (state = s)} />);
    const el = getByTestId('scroller');
    setGeometry(el, 100);
    act(() => el.dispatchEvent(new Event('scroll')));
    expect(state.isPinned).toBe(false);
    setGeometry(el, 900);
    act(() => el.dispatchEvent(new Event('scroll')));
    expect(state.isPinned).toBe(true);
  });

  it('does not move the view when unpinned and content arrives', () => {
    const { getByTestId, getByText } = render(<Harness onState={() => {}} />);
    const el = getByTestId('scroller');
    setGeometry(el, 100);
    act(() => el.dispatchEvent(new Event('scroll')));
    act(() => getByText('tick').click());
    expect(el.scrollTop).toBe(100);
  });

  it('follows new content while pinned', () => {
    const { getByTestId, getByText } = render(<Harness onState={() => {}} />);
    const el = getByTestId('scroller');
    setGeometry(el, 900);
    act(() => el.dispatchEvent(new Event('scroll')));
    act(() => getByText('tick').click());
    expect(el.scrollTop).toBe(1000);
  });
});
