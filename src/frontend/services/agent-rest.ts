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

export async function getThreadIdsByUserId(userId: string) {
  const targetUrl = apiUrl
    ? `${apiUrl}/v1/threads/${userId}`
    : `/api/proxy/agent/v1/threads/${userId}`;

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return response.json();
}

export async function gethistoryByThreadId(threadId: string) {
  const targetUrl = apiUrl
    ? `${apiUrl}/v1/history/${threadId}`
    : `/api/proxy/agent/v1/history/${threadId}`;

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return response.json().then((history) => {
    history.id = threadId;
    return history;
  });
}

export async function getAllThreadsByUserId(userId: string) {
  const threadIds = await getThreadIdsByUserId(userId);
  const threads = (await Promise.all(threadIds.map(gethistoryByThreadId))) as Thread[];
  return threads.map((thread) => ({
    ...thread,
    messages: combineToolCallandResult(thread.messages),
  }));
}
