import { Alert } from '@patternfly/react-core';
import type { StreamingState } from '@/redux/slices/chats';

interface ReconnectingBannerProps {
  streamingState: StreamingState;
  maxRetries: number;
}

export function ReconnectingBanner({ streamingState, maxRetries }: ReconnectingBannerProps) {
  if (!streamingState.isReconnecting) {
    return null;
  }

  const attemptText = `Attempt ${streamingState.reconnectAttempt}/${maxRetries}`;
  const midResponseWarning = streamingState.streamDroppedMidResponse
    ? ' Stream dropped mid-response. Resuming from last received event.'
    : '';

  return (
    <Alert variant="warning" isInline title="Reconnecting..." role="status" aria-live="polite">
      {attemptText}{midResponseWarning ? '.' : ''}{midResponseWarning}
    </Alert>
  );
}
