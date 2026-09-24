import { useEffect, useRef } from 'react';

export interface KeyboardShortcutsConfig {
  onNewChat?: () => void;
  onOpenSettings?: () => void;
  onFocusInput?: () => void;
  onCancelStream?: () => void;
  onToggleHelp?: () => void;
  onExportChat?: () => void;
  /** When Escape fires and streaming is active, `onCancelStream` runs instead of blurring. */
  getIsStreaming?: () => boolean;
  /** Blur the main chat input when Escape fires and not streaming. */
  onBlurChatInput?: () => void;
}

type ConfigGetter = () => KeyboardShortcutsConfig;

const layerGetters: ConfigGetter[] = [];

let globalListener: ((e: KeyboardEvent) => void) | null = null;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function pickCallback<K extends keyof KeyboardShortcutsConfig>(
  key: K,
): NonNullable<KeyboardShortcutsConfig[K]> | undefined {
  for (let i = layerGetters.length - 1; i >= 0; i--) {
    const v = layerGetters[i]()[key];
    if (typeof v === 'function') {
      return v as NonNullable<KeyboardShortcutsConfig[K]>;
    }
  }
  return undefined;
}

function pickStreamingGetter(): (() => boolean) | undefined {
  for (let i = layerGetters.length - 1; i >= 0; i--) {
    const g = layerGetters[i]().getIsStreaming;
    if (typeof g === 'function') return g;
  }
  return undefined;
}

function attachGlobalListener(): void {
  globalListener = (e: KeyboardEvent) => {
    if (e.repeat) return;

    const inEditable = isEditableTarget(e.target);

    if (e.key === 'Escape') {
      const streaming = pickStreamingGetter()?.() ?? false;
      const cancel = pickCallback('onCancelStream');
      const blur = pickCallback('onBlurChatInput');
      if (streaming && cancel) {
        cancel();
        e.preventDefault();
        return;
      }
      if (blur) {
        blur();
        e.preventDefault();
      }
      return;
    }

    if (inEditable) return;

    const mod = e.ctrlKey || e.metaKey;

    if (e.key === '/' && !mod && !e.altKey) {
      const fn = pickCallback('onFocusInput');
      if (fn) {
        e.preventDefault();
        fn();
      }
      return;
    }

    if (e.key === '?') {
      const fn = pickCallback('onToggleHelp');
      if (fn) {
        e.preventDefault();
        fn();
      }
      return;
    }

    if (mod && e.shiftKey && e.key.toLowerCase() === 's' && !e.altKey) {
      const fn = pickCallback('onOpenSettings');
      if (fn) {
        e.preventDefault();
        fn();
      }
      return;
    }

    if (mod && e.shiftKey && e.key.toLowerCase() === 'e' && !e.altKey) {
      const fn = pickCallback('onExportChat');
      if (fn) {
        e.preventDefault();
        fn();
      }
      return;
    }

    if (mod && !e.shiftKey && e.key.toLowerCase() === 'n' && !e.altKey) {
      const fn = pickCallback('onNewChat');
      if (fn) {
        e.preventDefault();
        fn();
      }
    }
  };

  document.addEventListener('keydown', globalListener);
}

function detachGlobalListener(): void {
  if (globalListener) {
    document.removeEventListener('keydown', globalListener);
    globalListener = null;
  }
}

/**
 * Registers global keyboard shortcuts. Multiple layers may be active (e.g. AppLayout + ChatPage);
 * the nearest layer with a matching hook call wins for each action.
 */
export function useKeyboardShortcuts(config: KeyboardShortcutsConfig): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const getter: ConfigGetter = () => configRef.current;
    layerGetters.push(getter);

    if (layerGetters.length === 1) {
      attachGlobalListener();
    }

    return () => {
      const idx = layerGetters.indexOf(getter);
      if (idx >= 0) {
        layerGetters.splice(idx, 1);
      }
      if (layerGetters.length === 0) {
        detachGlobalListener();
      }
    };
  }, []);
}
