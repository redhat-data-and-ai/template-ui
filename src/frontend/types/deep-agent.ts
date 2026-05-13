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

export interface InterruptInfo {
  value: string;
  resumable: boolean;
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
  if (toolCall.name === 'task' && toolCall.args?.subagent_type) return true;
  return KNOWN_SUBAGENT_NAMES.has(toolCall.name);
}

export function extractSubAgentName(toolCall: { name: string; args?: Record<string, unknown> }): string {
  if (toolCall.name === 'task' && typeof toolCall.args?.subagent_type === 'string') {
    return toolCall.args.subagent_type;
  }
  return toolCall.name;
}

const CODE_FENCE_RE = /```[\s\S]*?```/;
const JSON_START_RE = /^\s*[{\[]/;

export type ArtifactKind = 'code' | 'json' | 'markdown' | 'text';

export function detectArtifactKind(content: string): ArtifactKind {
  if (CODE_FENCE_RE.test(content)) return 'code';
  if (JSON_START_RE.test(content)) {
    try { JSON.parse(content); return 'json'; } catch { /* not valid json */ }
  }
  if (content.includes('# ') || content.includes('**') || content.includes('- ')) return 'markdown';
  return 'text';
}
