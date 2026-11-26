import type { MouseEvent } from 'react';

/** True for an unmodified primary-button click; others keep native link behaviour. */
export function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
