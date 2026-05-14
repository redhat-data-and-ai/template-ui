export interface FeedbackPayload {
  traceId: string;
  name: string;
  value: number;
  comment?: string;
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  const response = await fetch('/api/proxy/agent/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      trace_id: payload.traceId,
      name: payload.name,
      value: payload.value,
      kwargs: payload.comment ? { comment: payload.comment } : {},
    }),
  });
  if (!response.ok) {
    throw new Error(`Feedback failed: ${response.status}`);
  }
}
