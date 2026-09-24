import { buildAgentApiUrl } from '../lib/app-paths';

export interface FeedbackPayload {
  traceId: string;
  name: string;
  value: number;
  comment?: string;
  threadId?: string;
  messageId?: string;
  userId?: string;
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  const response = await fetch(buildAgentApiUrl('/feedback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      trace_id: payload.traceId,
      name: payload.name,
      value: payload.value,
      kwargs: payload.comment ? { comment: payload.comment } : {},
      thread_id: payload.threadId,
      message_id: payload.messageId,
      user_id: payload.userId || 'anonymous',
    }),
  });
  if (!response.ok) {
    throw new Error(`Feedback failed: ${response.status}`);
  }
}

export async function getThreadFeedback(
  threadId: string,
  userId: string = 'anonymous',
): Promise<Record<string, 'up' | 'down'>> {
  const response = await fetch(
    `${buildAgentApiUrl(`/feedback/${encodeURIComponent(threadId)}`)}?user_id=${encodeURIComponent(userId)}`,
    {
      credentials: 'include',
    },
  );
  if (!response.ok) return {};
  const data = (await response.json()) as { feedback?: Array<{ message_id: string; feedback: 'up' | 'down' }> };
  const result: Record<string, 'up' | 'down'> = {};
  for (const item of data.feedback || []) {
    result[item.message_id] = item.feedback;
  }
  return result;
}
