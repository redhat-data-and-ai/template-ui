import { describe, it, expect } from 'vitest';
import { dragHasFiles, filesFromPaste } from '../useAttachmentUpload';

/**
 * The two guards that decide whether an event is an attachment at all.
 * Both exist because the alternative breaks ordinary use: a drag of
 * selected text must not raise a full-screen overlay, and a paste of
 * ordinary text must not be swallowed.
 */
describe('dragHasFiles', () => {
  it('is true for a file drag', () => {
    expect(dragHasFiles({ dataTransfer: { types: ['Files'] } } as never)).toBe(true);
  });

  it('is false for dragged text', () => {
    // Dragging a selected word fires the same events. Treating it as
    // an upload puts an overlay in front of someone moving a word.
    expect(
      dragHasFiles({ dataTransfer: { types: ['text/plain'] } } as never),
    ).toBe(false);
  });

  it('is false when there is no dataTransfer', () => {
    expect(dragHasFiles({} as never)).toBe(false);
  });
});

describe('filesFromPaste', () => {
  const paste = (items: unknown[]) =>
    filesFromPaste({ clipboardData: { items } } as never);

  it('returns nothing for a text paste, so typing still works', () => {
    expect(paste([{ kind: 'string', getAsFile: () => null }])).toEqual([]);
  });

  it('returns the file for a screenshot paste', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    expect(paste([{ kind: 'file', getAsFile: () => file }])).toEqual([file]);
  });

  it('ignores file items that yield nothing', () => {
    expect(paste([{ kind: 'file', getAsFile: () => null }])).toEqual([]);
  });

  it('returns nothing when there is no clipboard data', () => {
    expect(filesFromPaste({} as never)).toEqual([]);
  });
});
