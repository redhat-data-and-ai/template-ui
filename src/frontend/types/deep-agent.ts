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
