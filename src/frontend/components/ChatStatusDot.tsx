import { useTranslation } from 'react-i18next';
import type { ChatActivity } from '../lib/chat-activity';

/**
 * Whether a conversation is working, waiting on you, or done.
 *
 * Only the chat on screen showed any of this, so a delegated turn
 * running for two minutes in another conversation looked exactly
 * like a finished one — and so did one that had stopped to ask a
 * question.
 *
 * Green pulses because it is still moving. Yellow does not: a thing
 * that needs you should sit still and be read, and two different
 * animations in a list is just motion.
 */
export function ChatStatusDot({ activity }: { activity: ChatActivity }) {
  const { t } = useTranslation();
  if (activity === 'idle') return null;

  const running = activity === 'running';
  const label = running ? t('sidebar.statusRunning') : t('sidebar.statusNeedsInput');

  return (
    <span
      className="relative flex h-2 w-2 shrink-0"
      role="img"
      aria-label={label}
      title={label}
      data-testid={`chat-status-${activity}`}
    >
      {running && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75 motion-reduce:hidden"
          aria-hidden="true"
        />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          running ? 'bg-green-500' : 'bg-yellow-500'
        }`}
        aria-hidden="true"
      />
    </span>
  );
}

export default ChatStatusDot;
