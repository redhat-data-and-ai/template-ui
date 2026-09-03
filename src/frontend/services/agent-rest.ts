import { AIMessage, Message } from "@langchain/langgraph-sdk";
import { authenticatedFetch } from "./authenticated-fetch";
import { buildAgentApiUrl } from "../lib/app-paths";
import { withMcpAppArguments } from "../types/mcp-apps";

export interface Thread {
  id: string;
  title?: string;
  messages: Message[];
  updatedAt?: string;
  project_id?: string | null;
}

/**
 * When a supervisor agent echoes a sub-agent's response, the stored
 * content array contains both the original structured text block and
 * a raw-string echo that partially repeats it.  After joining the
 * parts into a single string, this function finds and strips the
 * longest repeated region (≥ 80 chars, ≥ 15 % of total length).
 */
function deduplicateEcho(text: string): string {
  const MIN_OVERLAP = 80;
  if (text.length < MIN_OVERLAP * 2) return text;

  for (let i = 0; i < text.length - MIN_OVERLAP; i++) {
    const pattern = text.substring(i, i + MIN_OVERLAP);
    const secondPos = text.indexOf(pattern, i + MIN_OVERLAP);
    if (secondPos === -1) continue;

    let matchEnd = MIN_OVERLAP;
    while (
      i + matchEnd < secondPos &&
      secondPos + matchEnd < text.length &&
      text[i + matchEnd] === text[secondPos + matchEnd]
    ) {
      matchEnd++;
    }

    if (matchEnd < text.length * 0.15) continue;

    return text.substring(0, secondPos) + text.substring(secondPos + matchEnd);
  }
  return text;
}

/**
 * Gemini-style models return content as [{type:"text", text:"..."}] arrays.
 * Normalize to a plain string so the UI can render it directly.
 * When mixed structured + raw-string blocks are detected (supervisor echo
 * pattern), applies deduplication.
 */
function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const hasStructured = content.some((b: any) => b?.type === 'text');
    const hasRaw = content.some((b: any) => typeof b === 'string');
    const joined = content
      .map((b: any) => {
        if (typeof b === 'string') return b;
        if (b?.type === 'text' && typeof b.text === 'string') return b.text;
        return '';
      })
      .join('');
    return hasStructured && hasRaw ? deduplicateEcho(joined) : joined;
  }
  return typeof content === 'object' ? JSON.stringify(content) : String(content ?? '');
}

function normalizeMessages(messages: any[]): Message[] {
  return messages.map((m) => ({
    ...m,
    content: normalizeContent(m.content),
  }));
}

function extractMcpAppFromToolMessage(
  message: Message & { mcpApp?: Record<string, unknown>; artifact?: any },
): Record<string, unknown> | undefined {
  const candidates = [
    message.mcpApp,
    message.artifact?.mcp_app,
    message.artifact?.mcpApp,
  ];
  for (const value of candidates) {
    if (value && typeof value === 'object' && typeof (value as any).resourceUri === 'string') {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
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
              const toolMsg = message as Message & {
                mcpApp?: Record<string, unknown>;
                artifact?: unknown;
              };
              const mcpApp = extractMcpAppFromToolMessage(toolMsg);
              const updated = aiMsg.tool_calls.map((tc, j) => {
                if (j !== idx) return { ...tc };
                const merged: Record<string, unknown> = {
                  ...tc,
                  content: normalizeContent(message.content),
                };
                if (toolMsg.artifact !== undefined) {
                  merged.artifact = toolMsg.artifact;
                }
                if (mcpApp) {
                  merged.mcpApp = withMcpAppArguments(
                    mcpApp,
                    (tc as { args?: Record<string, unknown> }).args,
                  );
                }
                return merged;
              });
              newMessages[i] = { ...aiMsg, tool_calls: updated } as any;
            }
          }
        }
      }
    }
  });
  return newMessages;
}

function getAuthHeaders(includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (window.USER_DATA?.accessToken) {
    headers['X-Token'] = window.USER_DATA.accessToken;
  }
  return headers;
}

/**
 * Lightweight thread listing — returns thread IDs and metadata only.
 * Does NOT fetch full state (which is extremely slow per-thread).
 */
export async function getAllThreadsByUserId(userId: string): Promise<Thread[]> {
  const searchUrl = buildAgentApiUrl('/threads/search');

  let response: Response;
  try {
    response = await authenticatedFetch(searchUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        metadata: { user_identity: userId },
        limit: 50,
      }),
    });
  } catch {
    return [];
  }

  if (!response.ok) return [];

  let results: unknown;
  try {
    results = await response.json();
  } catch {
    return [];
  }
  if (!Array.isArray(results)) return [];

  return results
    .filter((t: any) => t.thread_id)
    .map((t: any) => ({
      id: t.thread_id,
      title: t.metadata?.thread_name,
      messages: [],
      updatedAt: t.updated_at || t.created_at,
      project_id: t.metadata?.project_id ?? null,
    }));
}

/**
 * Delete a thread from the backend (LangGraph Platform).
 * Returns true if the deletion succeeded (or thread was already gone).
 */
export async function deleteThread(threadId: string): Promise<boolean> {
  const deleteUrl = buildAgentApiUrl(`/threads/${threadId}`);

  try {
    const resp = await authenticatedFetch(deleteUrl, {
      method: 'DELETE',
      headers: getAuthHeaders(false),
    });
    return resp.ok || resp.status === 404;
  } catch {
    return false;
  }
}

/**
 * Fetch full state for a single thread (lazy, on-demand).
 * Called only when a user navigates into a specific chat.
 */
async function fetchThreadStateRaw(threadId: string): Promise<Record<string, unknown> | null> {
  const stateUrl = buildAgentApiUrl(`/threads/${threadId}/state`);
  try {
    const resp = await authenticatedFetch(stateUrl, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) return null;
    return await resp.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getThreadState(threadId: string): Promise<Message[]> {
  const state = await fetchThreadStateRaw(threadId);
  if (!state) return [];
  const msgs = state?.values ? (state.values as Record<string, unknown>)?.messages : undefined;
  if (Array.isArray(msgs) && msgs.length > 0) {
    return combineToolCallandResult(normalizeMessages(msgs));
  }
  return [];
}

export async function getThreadPendingInterrupt(
  threadId: string,
): Promise<{ value: unknown; resumable: boolean } | null> {
  const state = await fetchThreadStateRaw(threadId);
  if (!state) return null;
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  for (const task of tasks) {
    if (Array.isArray((task as any)?.interrupts) && (task as any).interrupts.length > 0) {
      const first = (task as any).interrupts[0];
      return { value: first.value, resumable: first.resumable !== false };
    }
  }
  return null;
}

export async function getThreadStateAndInterrupt(
  threadId: string,
): Promise<{ messages: Message[]; interrupt: { value: unknown; resumable: boolean } | null }> {
  const state = await fetchThreadStateRaw(threadId);
  if (!state) return { messages: [], interrupt: null };

  const msgs = state?.values ? (state.values as Record<string, unknown>)?.messages : undefined;
  const messages = Array.isArray(msgs) && msgs.length > 0
    ? combineToolCallandResult(normalizeMessages(msgs))
    : [];

  let interrupt: { value: unknown; resumable: boolean } | null = null;
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  for (const task of tasks) {
    if (Array.isArray((task as any)?.interrupts) && (task as any).interrupts.length > 0) {
      const first = (task as any).interrupts[0];
      interrupt = { value: first.value, resumable: first.resumable !== false };
      break;
    }
  }

  return { messages, interrupt };
}
