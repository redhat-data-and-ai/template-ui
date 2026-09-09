import type { Turn, ToolCall } from './eval-dataset-types';

/** Creates a blank ToolCall with one empty argument row, used as the default when adding a new tool call. */
export function emptyToolCall(): ToolCall {
  return { toolName: '', arguments: [{ key: '', value: '' }] };
}

/** Creates a blank Turn with default field values, used when adding a new conversation turn. */
export function emptyTurn(): Turn {
  return {
    id: crypto.randomUUID(),
    userMessage: '',
    expectedResponse: '',
    expectedIntent: '',
    expectedKeywords: [''],
    toolCallEnabled: false,
    toolCallOrdered: false,
    expectedToolCalls: [],
  };
}

/** Normalizes a Turn by replacing any nullish fields with safe defaults to prevent rendering errors. */
export function normTurn(t: Turn): Turn {
  return {
    ...t,
    userMessage: t.userMessage ?? '',
    expectedResponse: t.expectedResponse ?? '',
    expectedIntent: t.expectedIntent ?? '',
    expectedKeywords: t.expectedKeywords ?? [''],
    toolCallEnabled: t.toolCallEnabled ?? false,
    toolCallOrdered: t.toolCallOrdered ?? false,
    expectedToolCalls: t.expectedToolCalls ?? [],
  };
}
