import { AIMessage, Message } from "@langchain/langgraph-sdk";

export interface Thread {
  id: string;
  messages: Message[];
}

const apiUrl = window.APP_DATA?.apiUrl || '';

/**
 * Gemini-style models return content as [{type:"text", text:"..."}] arrays.
 * Normalize to a plain string so the UI can render it directly.
 */
function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('');
  }
  return typeof content === 'object' ? JSON.stringify(content) : String(content ?? '');
}

function normalizeMessages(messages: any[]): Message[] {
  return messages.map((m) => ({
    ...m,
    content: normalizeContent(m.content),
  }));
}

function combineToolCallandResult(messages: Message[]) {
  const newMessages: Message[] = [];
  messages.forEach((message) => {
    if (message.type !== 'tool') {
      newMessages.push({ ...message });
    } else {
      const toolCallId = message.tool_call_id;
      for (let i = 0; i < newMessages.length; i++) {
        if (newMessages[i].type === 'ai') {
          const aiMsg = newMessages[i] as AIMessage;
          if (Array.isArray(aiMsg.tool_calls) && aiMsg.tool_calls.length > 0 && toolCallId) {
            const idx = aiMsg.tool_calls.findIndex((tc) => tc.id === toolCallId);
            if (idx !== -1) {
              const updated = aiMsg.tool_calls.map((tc, j) =>
                j === idx ? { ...tc, content: normalizeContent(message.content) } : { ...tc },
              );
              newMessages[i] = { ...aiMsg, tool_calls: updated } as any;
            }
          }
        }
      }
    }
  });
  return newMessages;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (window.USER_DATA?.accessToken) {
    headers['X-Token'] = window.USER_DATA.accessToken;
  }
  return headers;
}

export async function getAllThreadsByUserId(userId: string): Promise<Thread[]> {
  const searchUrl = apiUrl
    ? `${apiUrl}/threads/search`
    : `/api/proxy/agent/threads/search`;

  const response = await fetch(searchUrl, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      metadata: { user_identity: userId },
      limit: 50,
    }),
  });

  if (!response.ok) return [];

  const results = await response.json();
  if (!Array.isArray(results)) return [];

  const threads: Thread[] = [];

  for (const t of results) {
    const id = t.thread_id;
    if (!id) continue;

    const stateUrl = apiUrl
      ? `${apiUrl}/threads/${id}/state`
      : `/api/proxy/agent/threads/${id}/state`;

    try {
      const stateResp = await fetch(stateUrl, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!stateResp.ok) continue;

      const state = await stateResp.json();
      const msgs = state?.values?.messages;
      if (Array.isArray(msgs) && msgs.length > 0) {
        threads.push({
          id,
          messages: combineToolCallandResult(normalizeMessages(msgs)),
        });
      }
    } catch {
      continue;
    }
  }

  return threads;
}
