import { buildAgentApiUrl } from '../lib/app-paths';

export interface ForkResponse {
  thread_id: string;
  forked_from: string;
  message_count: number;
}

/**
 * Copy a conversation up to `messageIndex` into a new thread.
 *
 * The source thread is not modified — forks branch by copying, not by
 * rewriting history, so the original stays linkable and searchable.
 */
export async function forkThread(
  threadId: string,
  messageIndex: number,
): Promise<ForkResponse> {
  const response = await fetch(buildAgentApiUrl(`/threads/${threadId}/fork`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message_index: messageIndex }),
  });

  if (!response.ok) {
    throw new Error(`Fork failed: ${response.status}`);
  }
  return response.json();
}
