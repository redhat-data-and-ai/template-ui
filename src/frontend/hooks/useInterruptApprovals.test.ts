import { describe, expect, it } from 'vitest';
import type { Message } from '@langchain/langgraph-sdk';
import { bindToolApprovals, type ToolApproval } from './useInterruptApprovals';

function approval(name: string, args: Record<string, unknown>): ToolApproval {
  return {
    key: name,
    interruptId: 'interrupt',
    actionIndex: 0,
    request: { name, args },
    disabled: false,
    decision: null,
    decide: () => {},
  };
}

describe('bindToolApprovals', () => {
  it('binds an unfinished tool inside one subagent transcript', () => {
    const messages = [{
      type: 'ai',
      content: '',
      tool_calls: [{
        id: 'task',
        name: 'task',
        args: { subagent_type: 'researcher' },
        transcript: [{
          id: 'sub-1',
          tool_calls: [{ id: 'inner', name: 'lookup_records', args: { query: 'example' } }],
        }],
      }],
    }] as unknown as Message[];

    const { bindings, unmatched } = bindToolApprovals(messages, [
      approval('lookup_records', { query: 'example' }),
    ]);

    expect(bindings.get('inner')?.request.name).toBe('lookup_records');
    expect(unmatched).toEqual([]);
  });

  it('leaves the approval unmatched when two cards have the same unfinished tool', () => {
    const tool = { id: 'inner', name: 'lookup_records', args: { query: 'example' } };
    const messages = [{
      type: 'ai',
      content: '',
      tool_calls: [
        { id: 'task-a', name: 'task', args: { subagent_type: 'researcher' }, transcript: [{ id: 'a', tool_calls: [{ ...tool, id: 'inner-a' }] }] },
        { id: 'task-b', name: 'task', args: { subagent_type: 'analyst' }, transcript: [{ id: 'b', tool_calls: [{ ...tool, id: 'inner-b' }] }] },
      ],
    }] as unknown as Message[];

    const { bindings, unmatched } = bindToolApprovals(messages, [
      approval('lookup_records', { query: 'example' }),
    ]);

    expect(bindings.size).toBe(0);
    expect(unmatched).toHaveLength(1);
  });

  it('still binds a task launch to the parent call', () => {
    const messages = [{
      type: 'ai',
      content: '',
      tool_calls: [{ id: 'task', name: 'task', args: { subagent_type: 'researcher' } }],
    }] as unknown as Message[];

    const { bindings } = bindToolApprovals(messages, [
      approval('task', { subagent_type: 'researcher' }),
    ]);

    expect(bindings.get('task')?.request.name).toBe('task');
  });
});
