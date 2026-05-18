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

export function FeedbackButtons({
  messageId,
  traceId,
  chatId,
  userId,
  existingFeedback = null,
}: FeedbackButtonsProps) {
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveTraceId = traceId || chatId;
  const disabled = !effectiveTraceId || isSubmitting;

  const handleVote = useCallback(
    async (direction: 'up' | 'down') => {
      if (!effectiveTraceId || isSubmitting) {
        return;
      }
      if (existingFeedback === direction) {
        dispatch(setMessageFeedback({ chatId, messageId, feedback: null }));
        return;
      }
      setIsSubmitting(true);
      try {
        await submitFeedback({
          traceId: effectiveTraceId,
          name: direction === 'up' ? 'thumbs-up' : 'thumbs-down',
          value: direction === 'up' ? 1.0 : 0.0,
          threadId: chatId,
          messageId,
          userId: userId || 'anonymous',
        });
        dispatch(setMessageFeedback({ chatId, messageId, feedback: direction }));
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
      }
    },
    [effectiveTraceId, isSubmitting, existingFeedback, dispatch, chatId, messageId, userId],
  );

  const baseBtn =
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

  return (
    <div
      className="mt-1 flex items-center gap-0.5 opacity-80 transition-opacity group-hover:opacity-100"
      role="group"
      aria-label="Message feedback"
    >
      <button
        type="button"
        className={cn(
          baseBtn,
          existingFeedback === 'up' && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary',
        )}
        disabled={disabled}
        aria-pressed={existingFeedback === 'up' ? true : false}
        aria-label="Rate response as helpful"
        onClick={() => void handleVote('up')}
      >
        <ThumbsUp className={cn('h-3.5 w-3.5', existingFeedback === 'up' && 'fill-current')} strokeWidth={2} />
      </button>
      <button
        type="button"
        className={cn(
          baseBtn,
          existingFeedback === 'down' && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary',
        )}
        disabled={disabled}
        aria-pressed={existingFeedback === 'down' ? true : false}
        aria-label="Rate response as not helpful"
        onClick={() => void handleVote('down')}
      >
        <ThumbsDown className={cn('h-3.5 w-3.5', existingFeedback === 'down' && 'fill-current')} strokeWidth={2} />
      </button>
    </div>
  );
}
