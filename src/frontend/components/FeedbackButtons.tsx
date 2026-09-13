import { useCallback, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

import { cn } from '../lib/utils';
import { useAppDispatch } from '../redux/hooks';
import { setMessageFeedback } from '../redux/slices/chats';
import { addToast } from '../redux/slices/toasts';
import { submitFeedback } from '../services/feedback-api';

export interface FeedbackButtonsProps {
  messageId: string;
  traceId: string | null;
  chatId: string;
  userId?: string;
  existingFeedback?: 'up' | 'down' | null;
}

/** State returned by useFeedback */
export interface FeedbackState {
  existingFeedback: 'up' | 'down' | null;
  isSubmitting: boolean;
  showCommentInput: boolean;
  comment: string;
  disabled: boolean;
  handleThumbsUp: () => void;
  handleThumbsDown: () => void;
  handleCommentSubmit: () => void;
  setComment: (v: string) => void;
  cancelComment: () => void;
}

/** Hook that owns all feedback state and side effects */
export function useFeedback({
  messageId,
  traceId,
  chatId,
  userId,
  existingFeedback = null,
}: FeedbackButtonsProps): FeedbackState {
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [comment, setComment] = useState('');

  const effectiveTraceId = traceId || chatId;
  const locked = !!existingFeedback;
  const disabled = !effectiveTraceId || isSubmitting || locked;

  const doSendFeedback = useCallback(
    async (direction: 'up' | 'down', feedbackComment?: string) => {
      if (!effectiveTraceId || locked) return;
      setIsSubmitting(true);
      try {
        await submitFeedback({
          traceId: effectiveTraceId,
          name: direction === 'up' ? 'thumbs-up' : 'thumbs-down',
          value: direction === 'up' ? 1.0 : 0.0,
          comment: feedbackComment || undefined,
          threadId: chatId,
          messageId,
          userId: userId || 'anonymous',
        });
        dispatch(setMessageFeedback({ chatId, messageId, feedback: direction }));
        if (direction === 'down') {
          dispatch(
            addToast({
              title: 'Thank you for your feedback',
              message: 'We will work to improve.',
              variant: 'info',
            }),
          );
        }
      } catch (e) {
        dispatch(
          addToast({
            title: 'Feedback failed',
            message: e instanceof Error ? e.message : 'Please try again.',
            variant: 'danger',
          }),
        );
      } finally {
        setIsSubmitting(false);
        setShowCommentInput(false);
        setComment('');
      }
    },
    [effectiveTraceId, locked, dispatch, chatId, messageId, userId],
  );

  const handleThumbsUp = useCallback(() => {
    if (locked || isSubmitting) return;
    void doSendFeedback('up');
  }, [locked, isSubmitting, doSendFeedback]);

  const handleThumbsDown = useCallback(() => {
    if (locked || isSubmitting) return;
    setShowCommentInput(true);
  }, [locked, isSubmitting]);

  const handleCommentSubmit = useCallback(() => {
    void doSendFeedback('down', comment.trim() || undefined);
  }, [doSendFeedback, comment]);

  const cancelComment = useCallback(() => {
    setShowCommentInput(false);
    setComment('');
  }, []);

  return {
    existingFeedback,
    isSubmitting,
    showCommentInput,
    comment,
    disabled,
    handleThumbsUp,
    handleThumbsDown,
    handleCommentSubmit,
    setComment,
    cancelComment,
  };
}

/** Inline thumbs-up and thumbs-down buttons */
export function FeedbackButtons({ fb }: { fb: FeedbackState }) {
  const baseBtn =
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

  return (
    <>
      <button
        type="button"
        className={cn(
          baseBtn,
          fb.existingFeedback === 'up' && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary',
        )}
        disabled={fb.disabled}
        aria-pressed={fb.existingFeedback === 'up' ? true : false}
        aria-label="Rate response as helpful"
        onClick={fb.handleThumbsUp}
      >
        <ThumbsUp className={cn('h-3.5 w-3.5', fb.existingFeedback === 'up' && 'fill-current')} strokeWidth={2} />
      </button>
      <button
        type="button"
        className={cn(
          baseBtn,
          fb.existingFeedback === 'down' && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary',
        )}
        disabled={fb.disabled}
        aria-pressed={fb.existingFeedback === 'down' ? true : false}
        aria-label="Rate response as not helpful"
        onClick={fb.handleThumbsDown}
      >
        <ThumbsDown className={cn('h-3.5 w-3.5', fb.existingFeedback === 'down' && 'fill-current')} strokeWidth={2} />
      </button>
    </>
  );
}

/** Comment box for thumbs-down feedback */
export function FeedbackCommentBox({ fb }: { fb: FeedbackState }) {
  if (!fb.showCommentInput || !!fb.existingFeedback) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      fb.handleCommentSubmit();
    } else if (e.key === 'Escape') {
      fb.cancelComment();
    }
  };

  return (
    <div className="pl-11 mt-1">
      <div className="rounded-lg border border-border bg-muted/50 p-3 min-w-[280px] max-w-[400px] animate-in fade-in slide-in-from-top-1 duration-200">
        <textarea
          value={fb.comment}
          onChange={(e) => fb.setComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What went wrong? (optional)"
          className="w-full resize-none border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          autoFocus
          rows={1}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={fb.cancelComment}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            disabled={fb.isSubmitting}
            onClick={fb.handleCommentSubmit}
          >
            {fb.isSubmitting ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
