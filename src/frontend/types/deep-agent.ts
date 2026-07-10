export type SubAgentStatus = 'delegating' | 'complete' | 'error';

export interface SubAgentInfo {
  name: string;
  toolCallId: string;
  status: SubAgentStatus;
  startedAt: number;
}

export interface ToolCallWithContent {
  name: string;
  args: Record<string, unknown>;
  id: string;
  content?: unknown;
}

export interface HITLActionRequest {
  name: string;
  args: Record<string, unknown>;
}

export interface HITLReviewConfig {
  action_name: string;
  allowed_decisions: ('approve' | 'edit' | 'reject' | 'respond')[];
}

export interface HITLInterruptValue {
  action_requests: HITLActionRequest[];
  review_configs: HITLReviewConfig[];
}

export interface McpAuthPayload {
  type: 'mcp_auth_required';
  mcp_name: string;
  connect_url: string;
  message: string;
}

export interface InterruptInfo {
  value: string | HITLInterruptValue;
  resumable: boolean;
  payload?: McpAuthPayload;
}

export interface TaskStep {
  id: string;
  name: string;
  status: 'running' | 'complete' | 'error';
  startedAt: number;
  completedAt?: number;
  result?: string;
}

const KNOWN_SUBAGENT_NAMES = new Set(['analyst', 'publisher']);

export function isSubAgentToolCall(toolCall: { name: string; args?: Record<string, unknown> }): boolean {
  if (toolCall.args?.subagent_type) return true;
  return KNOWN_SUBAGENT_NAMES.has(toolCall.name);
}

export function extractSubAgentName(toolCall: { name: string; args?: Record<string, unknown> }): string {
  if (toolCall.name === 'task' && typeof toolCall.args?.subagent_type === 'string') {
    return toolCall.args.subagent_type;
  }
  return toolCall.name;
}

export function extractDelegationText(
  toolCall: { args?: Record<string, unknown> | string },
): string | null {
  const { args } = toolCall;
  if (args == null) return null;
  if (typeof args === 'string') {
    const trimmed = args.trim();
    return trimmed || null;
  }
  if (typeof args.description === 'string') {
    const trimmed = args.description.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export function extractTodosFromMessages(messages: { type: string; tool_calls?: { name: string; args?: Record<string, unknown> }[] }[]): TodoItem[] {
  let latest: TodoItem[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'ai') continue;
    const toolCalls = msg.tool_calls;
    if (!Array.isArray(toolCalls)) continue;
    for (const tc of toolCalls) {
      if (tc.name !== 'write_todos') continue;
      const raw = tc.args?.todos;
      if (!Array.isArray(raw)) continue;
      latest = raw
        .filter((t): t is { content: string; status: string } =>
          t != null && typeof t === 'object' && typeof (t as Record<string, unknown>).content === 'string',
        )
        .map((t) => ({
          content: t.content,
          status: (['pending', 'in_progress', 'completed'].includes(t.status) ? t.status : 'pending') as TodoItem['status'],
        }));
      return latest;
    }
  }
  return latest;
}

const CODE_FENCE_RE = /```[\s\S]*?```/;
const JSON_START_RE = /^\s*[{[]/;

export type ArtifactKind = 'code' | 'json' | 'markdown' | 'text';

export function detectArtifactKind(content: string): ArtifactKind {
  if (CODE_FENCE_RE.test(content)) return 'code';
  if (JSON_START_RE.test(content)) {
    try { JSON.parse(content); return 'json'; } catch { /* not valid json */ }
  }
  if (content.includes('# ') || content.includes('**') || content.includes('- ')) return 'markdown';
  return 'text';
}
