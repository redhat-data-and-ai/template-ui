import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEvent } from 'react';
import { useSidebarDragDrop } from './useSidebarDragDrop';

function dragOverEvent(): DragEvent<HTMLElement> {
  return {
    preventDefault() {},
    dataTransfer: { dropEffect: '' },
  } as unknown as DragEvent<HTMLElement>;
}

function dropEvent(threadId: string): DragEvent<HTMLElement> {
  return {
    preventDefault() {},
    dataTransfer: { getData: () => threadId },
  } as unknown as DragEvent<HTMLElement>;
}

describe('useSidebarDragDrop', () => {
  it('keeps the drop target when leaving into a child', () => {
    const { result } = renderHook(() => useSidebarDragDrop(vi.fn(async () => true)));
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);

    act(() => {
      result.current.handleDragOver(dragOverEvent(), 'p1');
    });
    expect(result.current.dragOverTarget).toBe('p1');

    act(() => {
      result.current.handleDragLeave({
        currentTarget: parent,
        relatedTarget: child,
      } as unknown as DragEvent<HTMLElement>);
    });
    expect(result.current.dragOverTarget).toBe('p1');
  });

  it('clears the drop target when leaving the folder', () => {
    const { result } = renderHook(() => useSidebarDragDrop(vi.fn(async () => true)));
    const parent = document.createElement('div');

    act(() => {
      result.current.handleDragOver(dragOverEvent(), 'p1');
    });

    act(() => {
      result.current.handleDragLeave({
        currentTarget: parent,
        relatedTarget: document.createElement('div'),
      } as unknown as DragEvent<HTMLElement>);
    });
    expect(result.current.dragOverTarget).toBeNull();
  });

  it('ignores a second drop while the first assign is still running', async () => {
    let release!: (ok: boolean) => void;
    const onAssign = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useSidebarDragDrop(onAssign));

    let first: Promise<void>;
    act(() => {
      first = result.current.handleDrop(dropEvent('t1'), 'p1');
    });
    expect(onAssign).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleDrop(dropEvent('t1'), 'p2');
    });
    expect(onAssign).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(true);
      await first!;
    });
  });
});
