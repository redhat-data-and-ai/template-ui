import { describe, it, expect } from 'vitest';
import {
  isSubAgentToolCall,
  extractSubAgentName,
  extractDelegationText,
  extractTodosFromMessages,
  detectArtifactKind,
} from './deep-agent';

// ── isSubAgentToolCall ────────────────────────────────────────────────────────

describe('isSubAgentToolCall', () => {
  it('returns true when subagent_type arg is present', () => {
    expect(isSubAgentToolCall({ name: 'task', args: { subagent_type: 'analyst' } })).toBe(true);
  });

  it('returns true for a known subagent name "analyst"', () => {
    expect(isSubAgentToolCall({ name: 'analyst' })).toBe(true);
  });

  it('returns true for a known subagent name "publisher"', () => {
    expect(isSubAgentToolCall({ name: 'publisher' })).toBe(true);
  });

  it('returns false for an unknown name with no subagent_type arg', () => {
    expect(isSubAgentToolCall({ name: 'web_search', args: {} })).toBe(false);
  });

  it('returns false when name is "task" but no subagent_type arg', () => {
    expect(isSubAgentToolCall({ name: 'task', args: {} })).toBe(false);
  });
});

// ── extractSubAgentName ───────────────────────────────────────────────────────

describe('extractSubAgentName', () => {
  it('returns the subagent_type when name is "task"', () => {
    expect(extractSubAgentName({ name: 'task', args: { subagent_type: 'researcher' } })).toBe('researcher');
  });

  it('returns the tool name when it is not "task"', () => {
    expect(extractSubAgentName({ name: 'analyst', args: {} })).toBe('analyst');
  });

  it('returns "task" when name is "task" but subagent_type is missing', () => {
    expect(extractSubAgentName({ name: 'task', args: {} })).toBe('task');
  });
});

// ── extractDelegationText ─────────────────────────────────────────────────────

describe('extractDelegationText', () => {
  it('returns string args directly when non-empty', () => {
    expect(extractDelegationText({ args: '  Search for data  ' })).toBe('Search for data');
  });

  it('returns null for empty string args', () => {
    expect(extractDelegationText({ args: '   ' })).toBeNull();
  });

  it('returns description from object args', () => {
    expect(extractDelegationText({ args: { description: 'Analyze data' } })).toBe('Analyze data');
  });

  it('returns null when description is empty', () => {
    expect(extractDelegationText({ args: { description: '' } })).toBeNull();
  });

  it('returns null when args is null/undefined', () => {
    expect(extractDelegationText({ args: undefined })).toBeNull();
    expect(extractDelegationText({ args: null as any })).toBeNull();
  });
});

// ── extractTodosFromMessages ──────────────────────────────────────────────────

describe('extractTodosFromMessages', () => {
  it('returns todos from the latest write_todos tool call', () => {
    const messages = [
      {
        type: 'ai',
        tool_calls: [
          {
            name: 'write_todos',
            args: {
              todos: [
                { content: 'Research topic', status: 'completed' },
                { content: 'Draft report', status: 'in_progress' },
              ],
            },
          },
        ],
      },
    ];
    const todos = extractTodosFromMessages(messages);
    expect(todos).toHaveLength(2);
    expect(todos[0].content).toBe('Research topic');
    expect(todos[0].status).toBe('completed');
    expect(todos[1].status).toBe('in_progress');
  });

  it('defaults unknown status to "pending"', () => {
    const messages = [
      {
        type: 'ai',
        tool_calls: [{ name: 'write_todos', args: { todos: [{ content: 'Task', status: 'weird' }] } }],
      },
    ];
    const todos = extractTodosFromMessages(messages);
    expect(todos[0].status).toBe('pending');
  });

  it('returns [] when no messages have write_todos', () => {
    const messages = [{ type: 'ai', tool_calls: [{ name: 'web_search', args: {} }] }];
    expect(extractTodosFromMessages(messages)).toEqual([]);
  });

  it('returns [] for empty messages array', () => {
    expect(extractTodosFromMessages([])).toEqual([]);
  });

  it('returns the most recent write_todos when multiple exist', () => {
    const messages = [
      {
        type: 'ai',
        tool_calls: [{ name: 'write_todos', args: { todos: [{ content: 'Old', status: 'completed' }] } }],
      },
      {
        type: 'ai',
        tool_calls: [{ name: 'write_todos', args: { todos: [{ content: 'New', status: 'pending' }] } }],
      },
    ];
    // The function iterates from the end (last message first)
    const todos = extractTodosFromMessages(messages);
    expect(todos[0].content).toBe('New');
  });
});

// ── detectArtifactKind ────────────────────────────────────────────────────────

describe('detectArtifactKind', () => {
  it('returns "code" for content with a code fence', () => {
    expect(detectArtifactKind('Here is the code:\n```python\nprint("hi")\n```')).toBe('code');
  });

  it('returns "json" for valid JSON starting with {', () => {
    expect(detectArtifactKind('{"key": "value"}')).toBe('json');
  });

  it('does NOT return "json" for an invalid string that starts with {', () => {
    // JSON.parse throws → falls through to markdown/text classification
    expect(detectArtifactKind('{invalid json}')).not.toBe('json');
  });

  it('returns "json" for valid JSON starting with [', () => {
    expect(detectArtifactKind('[1,2,3]')).toBe('json');
  });

  it('returns "markdown" for content with headers', () => {
    expect(detectArtifactKind('# Title\nSome text')).toBe('markdown');
  });

  it('returns "markdown" for content with bold text', () => {
    expect(detectArtifactKind('This is **bold** text')).toBe('markdown');
  });

  it('returns "markdown" for content with a list', () => {
    expect(detectArtifactKind('- item one\n- item two')).toBe('markdown');
  });

  it('returns "text" for plain prose', () => {
    expect(detectArtifactKind('The weather is nice today.')).toBe('text');
  });

  it('returns "text" for an empty string', () => {
    expect(detectArtifactKind('')).toBe('text');
  });
});
