import type { StreamingState } from '../redux/slices/chats';

/**
 * What a chat in the sidebar is doing right now.
 *
 * A delegated turn runs for minutes, and the only place that was
 * visible was the chat you happened to be looking at. Start one, open
 * another conversation, and the first became indistinguishable from a
 * finished one — including when it had stopped to ask a question and
 * was waiting on an answer that was never coming.
 *
 * `needs-input` outranks `running`: a turn paused on an approval is
 * technically still loading, but what the reader has to know is that
 * it is blocked on them.
 */
export type ChatActivity = 'needs-input' | 'running' | 'idle';

export function chatActivity(state: StreamingState | undefined): ChatActivity {
  if (!state) return 'idle';
  if (state.pendingInterrupt) return 'needs-input';
  if (state.isLoading || state.isThinking) return 'running';
  return 'idle';
}

/** Activity for every chat that has one, keyed by chat id. */
export function activityByChat(
  streamingStates: Record<string, StreamingState>,
): Record<string, ChatActivity> {
  const out: Record<string, ChatActivity> = {};
  for (const [chatId, state] of Object.entries(streamingStates ?? {})) {
    const activity = chatActivity(state);
    if (activity !== 'idle') out[chatId] = activity;
  }
  return out;
}
