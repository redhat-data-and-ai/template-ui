import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function fireKeydown(key: string, opts: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  document.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a global keydown listener', () => {
    const spy = vi.spyOn(document, 'addEventListener');
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onNewChat: vi.fn() }),
    );
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    unmount();
  });

  it('removes listener on unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onNewChat: vi.fn() }),
    );
    unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('Ctrl+N triggers onNewChat', () => {
    const onNewChat = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onNewChat }),
    );

    fireKeydown('n', { ctrlKey: true });
    expect(onNewChat).toHaveBeenCalled();
    unmount();
  });

  it('Meta+N triggers onNewChat (macOS)', () => {
    const onNewChat = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onNewChat }),
    );

    fireKeydown('n', { metaKey: true });
    expect(onNewChat).toHaveBeenCalled();
    unmount();
  });

  it('/ triggers onFocusInput', () => {
    const onFocusInput = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onFocusInput }),
    );

    fireKeydown('/');
    expect(onFocusInput).toHaveBeenCalled();
    unmount();
  });

  it('? triggers onToggleHelp', () => {
    const onToggleHelp = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onToggleHelp }),
    );

    fireKeydown('?');
    expect(onToggleHelp).toHaveBeenCalled();
    unmount();
  });

  it('Ctrl+Shift+S triggers onOpenSettings', () => {
    const onOpenSettings = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onOpenSettings }),
    );

    fireKeydown('s', { ctrlKey: true, shiftKey: true });
    expect(onOpenSettings).toHaveBeenCalled();
    unmount();
  });

  it('Ctrl+Shift+E triggers onExportChat', () => {
    const onExportChat = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onExportChat }),
    );

    fireKeydown('e', { ctrlKey: true, shiftKey: true });
    expect(onExportChat).toHaveBeenCalled();
    unmount();
  });

  it('Escape triggers onCancelStream when streaming', () => {
    const onCancelStream = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({
        onCancelStream,
        getIsStreaming: () => true,
      }),
    );

    fireKeydown('Escape');
    expect(onCancelStream).toHaveBeenCalled();
    unmount();
  });

  it('Escape triggers onBlurChatInput when not streaming', () => {
    const onBlurChatInput = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({
        onBlurChatInput,
        getIsStreaming: () => false,
      }),
    );

    fireKeydown('Escape');
    expect(onBlurChatInput).toHaveBeenCalled();
    unmount();
  });

  it('ignores repeated key events', () => {
    const onFocusInput = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onFocusInput }),
    );

    const event = new KeyboardEvent('keydown', {
      key: '/',
      bubbles: true,
      repeat: true,
    });
    document.dispatchEvent(event);
    expect(onFocusInput).not.toHaveBeenCalled();
    unmount();
  });

  it('ignores shortcuts in editable elements (except Escape)', () => {
    const onFocusInput = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onFocusInput }),
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: '/',
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: input });
    document.dispatchEvent(event);
    expect(onFocusInput).not.toHaveBeenCalled();

    document.body.removeChild(input);
    unmount();
  });
});
