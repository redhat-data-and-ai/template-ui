export interface ToolCallArg {
  key: string;
  value: string;
}

export interface ToolCall {
  toolName: string;
  arguments: ToolCallArg[];
}


export interface Turn {
  id: string;
  userMessage: string;
  expectedResponse: string;
  expectedIntent: string;
  // Each string is one AND-row; comma-separated values within a row are OR-ed.
  expectedKeywords: string[];
  toolCallEnabled: boolean;
  toolCallOrdered: boolean;
  expectedToolCalls: ToolCall[];
}

// tag describes conversation shape; tool_use is NOT a separate tag —
// custom:tool_eval is auto-applied per-turn whenever expected_tool_calls is set.
export type CaseTag = 'non_hitl' | 'hitl' | 'multi_turn';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  tag: CaseTag;
  turns: Turn[];
  createdAt: string;
}

export interface EvalDataset {
  cases: TestCase[];
}
