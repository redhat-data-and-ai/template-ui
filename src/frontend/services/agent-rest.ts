import { AIMessage, Message } from "@langchain/langgraph-sdk";

export interface Thread {
  id: string;
  messages: Message[];
}

const apiUrl = window.APP_DATA?.apiUrl || '';

function combineToolCallandResult(messages: Message[]) {
  const newMessages: Message[] = [];
  messages.forEach((message) => {
    if (message.type !== 'tool') {
      newMessages.push(message);
    } else {
      const toolCallId = message.tool_call_id;
      for (let i = 0; i < newMessages.length; i++) {
        if (newMessages[i].type === 'ai') {
          if (
            Array.isArray((newMessages[i] as AIMessage)?.tool_calls) &&
            ((newMessages[i] as AIMessage)?.tool_calls?.length ?? 0) > 0 &&
            toolCallId
          ) {
            const toolCall = (newMessages[i] as AIMessage)?.tool_calls?.find(
              (tc) => tc.id === toolCallId
            );
            if (toolCall) {
              (toolCall as any).content = message.content;
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
  const targetUrl = apiUrl
    ? `${apiUrl}/threads/search`
    : `/api/proxy/agent/threads/search`;

  const response = await fetch(targetUrl, {
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

  return results
    .filter((t: any) => t.values?.messages?.length > 0)
    .map((t: any) => ({
      id: t.thread_id,
      messages: combineToolCallandResult(t.values.messages),
    }));
}
