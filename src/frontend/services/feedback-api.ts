import { authenticatedFetch } from './authenticated-fetch';
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

function getCurrentUserId(): string {
  return window.USER_DATA?.sub || window.USER_DATA?.preferred_username || 'anonymous';
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  const userId = payload.userId || getCurrentUserId();
  const response = await authenticatedFetch(buildAgentApiUrl('/feedback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trace_id: payload.traceId,
      name: payload.name,
      value: payload.value,
      kwargs: payload.comment ? { comment: payload.comment } : {},
      thread_id: payload.threadId,
      message_id: payload.messageId,
      user_id: userId,
    }),
  });
  if (!response.ok) {
    throw new Error(`Feedback failed: ${response.status}`);
  }
}

export async function getThreadFeedback(
  threadId: string,
  userId?: string,
): Promise<Record<string, 'up' | 'down'>> {
  const effectiveUserId = userId || getCurrentUserId();
  const response = await authenticatedFetch(
    `${buildAgentApiUrl(`/feedback/${encodeURIComponent(threadId)}`)}?user_id=${encodeURIComponent(effectiveUserId)}`,
  );
  if (!response.ok) return {};
  const data = (await response.json()) as { feedback?: Array<{ message_id: string; feedback: 'up' | 'down' }> };
  const result: Record<string, 'up' | 'down'> = {};
  for (const item of data.feedback || []) {
    result[item.message_id] = item.feedback;
  }
  return result;
}
