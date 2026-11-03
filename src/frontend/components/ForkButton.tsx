import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { forkThread } from '../services/fork-api';
import { useAppDispatch } from '../redux/hooks';
import { addChat } from '../redux/slices/chats';

interface ForkButtonProps {
  chatId: string;
  /**
   * How many messages to keep — the index of this message in the thread
   * plus one. Forking "at" a message means keeping it.
   */
  messageIndex: number;
  onForked?: (threadId: string) => void;
}

/**
 * Branch the conversation from this point into a new thread.
 *
 * The original is left alone, so this is a safe thing to click: nothing
 * about the conversation you are reading changes.
 */
export function ForkButton({ chatId, messageIndex, onForked }: ForkButtonProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleFork = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const { thread_id } = await forkThread(chatId, messageIndex);

      // Register the fork before navigating. The server created the
      // thread, but the sidebar is driven by the store — navigating
      // straight to an id it has never seen lands on an empty page
      // with no entry in the list, which reads as the button having
      // done nothing. The messages themselves are loaded from the
      // server by the chat page.
      dispatch(
        addChat({
          id: thread_id,
          title: 'Forked conversation',
          timestamp: new Date().toISOString(),
          preview: 'Branched from an earlier message',
          messages: [],
          historicalActivities: {},
          feedback: {},
        }),
      );

      onForked?.(thread_id);
      navigate(`/chat/${thread_id}`);
    } catch {
      // Nothing was created on a failure — the server deletes a fork it
      // could not seed — so retrying is safe.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleFork}
      disabled={busy}
      title={failed ? 'Fork failed — try again' : 'Branch a new conversation from here'}
      aria-label="Branch a new conversation from this message"
      className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 disabled:opacity-50 transition-colors"
    >
      <GitBranch
        className={`w-3.5 h-3.5 ${failed ? 'text-destructive' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}
