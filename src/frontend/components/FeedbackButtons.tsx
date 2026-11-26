import { useCallback, useRef, useState } from 'react';
import { Button } from '@patternfly/react-core';
import {
  OutlinedThumbsDownIcon,
  OutlinedThumbsUpIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '@patternfly/react-icons';

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
  const inFlightRef = useRef(false);

  const effectiveTraceId = traceId || chatId;
  const locked = !!existingFeedback;
  const disabled = !effectiveTraceId || isSubmitting || locked;

  const doSendFeedback = useCallback(
    async (direction: 'up' | 'down', feedbackComment?: string) => {
      if (!effectiveTraceId || locked || inFlightRef.current) return;
      inFlightRef.current = true;
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
        setShowCommentInput(false);
        setComment('');
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
        inFlightRef.current = false;
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

/** Inline thumbs-up and thumbs-down buttons (neutral grey; a selected rating shows as the filled icon). */
export function FeedbackButtons({ fb }: { fb: FeedbackState }) {
  return (
    <>
      <Button
        variant="plain"
        size="sm"
        isDisabled={fb.disabled}
        aria-pressed={fb.existingFeedback === 'up'}
        aria-label="Rate response as helpful"
        icon={fb.existingFeedback === 'up' ? <ThumbsUpIcon /> : <OutlinedThumbsUpIcon />}
        onClick={fb.handleThumbsUp}
      />
      <Button
        variant="plain"
        size="sm"
        isDisabled={fb.disabled}
        aria-pressed={fb.existingFeedback === 'down'}
        aria-label="Rate response as not helpful"
        icon={fb.existingFeedback === 'down' ? <ThumbsDownIcon /> : <OutlinedThumbsDownIcon />}
        onClick={fb.handleThumbsDown}
      />
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
    <div className="app-feedback-comment">
      <div className="app-feedback-comment__box">
        <textarea
          value={fb.comment}
          onChange={(e) => fb.setComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What went wrong? (optional)"
          aria-label="Feedback comment"
          autoFocus
          rows={1}
        />
        <div className="app-feedback-comment__actions">
          <Button variant="link" size="sm" onClick={fb.cancelComment}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" isDisabled={fb.isSubmitting} onClick={fb.handleCommentSubmit}>
            {fb.isSubmitting ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
