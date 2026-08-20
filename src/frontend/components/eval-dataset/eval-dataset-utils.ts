import type { Turn, ToolCall } from './eval-dataset-types';

export function emptyToolCall(): ToolCall {
  return { toolName: '', arguments: [{ key: '', value: '' }] };
}

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
