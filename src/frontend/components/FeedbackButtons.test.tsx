import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FeedbackCommentBox, type FeedbackState } from './FeedbackButtons';

function commentState(comment: string): FeedbackState {
  return {
    existingFeedback: null,
    isSubmitting: false,
    showCommentInput: true,
    comment,
    disabled: false,
    handleThumbsUp: vi.fn(),
    handleThumbsDown: vi.fn(),
    handleCommentSubmit: vi.fn(),
    setComment: vi.fn(),
    cancelComment: vi.fn(),
  };
}

describe('FeedbackCommentBox', () => {
  it('keeps Send disabled until the comment has text', () => {
    const { rerender } = render(<FeedbackCommentBox fb={commentState('')} />);
    const send = screen.getByRole('button', { name: 'Send' });
    const comment = screen.getByRole('textbox', { name: 'What went wrong?' });

    expect(comment).toBeRequired();
    expect(send).toBeDisabled();

    rerender(<FeedbackCommentBox fb={commentState('   ')} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    rerender(<FeedbackCommentBox fb={commentState('The table was wrong')} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('does not send a blank comment with Enter', () => {
    const fb = commentState('   ');
    render(<FeedbackCommentBox fb={fb} />);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'What went wrong?' }), {
      key: 'Enter',
    });

    expect(fb.handleCommentSubmit).not.toHaveBeenCalled();
  });

  it('sends when Enter is pressed on a real comment', () => {
    const fb = commentState('The citation was wrong');
    render(<FeedbackCommentBox fb={fb} />);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'What went wrong?' }), {
      key: 'Enter',
    });

    expect(fb.handleCommentSubmit).toHaveBeenCalledOnce();
  });
});
