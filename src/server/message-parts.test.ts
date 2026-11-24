import { describe, expect, it } from 'vitest';
import { splitMessageParts } from './message-parts.js';

describe('splitMessageParts', () => {
  it('reads a Claude thinking block and leaves the signature out', () => {
    const parts = splitMessageParts({
      content: [
        { type: 'thinking', thinking: 'check the schema', signature: 'sig' },
        { type: 'text', text: 'Use the orders table.' },
      ],
    });
    expect(parts.thinking).toBe('check the schema');
    expect(parts.answer).toBe('Use the orders table.');
    expect(parts.thinking).not.toContain('sig');
    expect(parts.answer).not.toContain('sig');
  });

  it('reads a Gemini thought part separately from the answer', () => {
    const parts = splitMessageParts({
      content: [
        { type: 'text', text: 'Looking at the schema', thought: true },
        { type: 'text', text: 'Use the orders table.' },
      ],
    });
    expect(parts.thinking).toBe('Looking at the schema');
    expect(parts.answer).toBe('Use the orders table.');
  });

  it('reads a reasoning block', () => {
    const parts = splitMessageParts({
      content: [
        { type: 'reasoning', reasoning: 'because the filter matches' },
        { type: 'text', text: '42' },
      ],
    });
    expect(parts.thinking).toBe('because the filter matches');
    expect(parts.answer).toBe('42');
  });

  it('reads think tags inside a plain string', () => {
    const parts = splitMessageParts({
      content: 'Before <think>secret</think> after',
    });
    expect(parts.thinking).toBe('secret');
    expect(parts.answer).toBe('Before  after');
  });

  it('keeps an unfinished think tag as the growing thought', () => {
    const parts = splitMessageParts({ content: '<thinking>still going' });
    expect(parts.thinking).toBe('still going');
    expect(parts.answer).toBe('');
  });

  it('uses reasoning_content when the blocks have no thought', () => {
    const parts = splitMessageParts({
      content: 'The answer',
      additional_kwargs: { reasoning_content: 'worked it out' },
    });
    expect(parts.thinking).toBe('worked it out');
    expect(parts.answer).toBe('The answer');
  });

  it('does not repeat a thought that is already on the blocks', () => {
    const parts = splitMessageParts({
      content: [{ type: 'thinking', thinking: 'once' }, { type: 'text', text: 'Answer' }],
      additional_kwargs: { reasoning_content: 'once' },
    });
    expect(parts.thinking).toBe('once');
  });

  it('skips encrypted redacted thinking', () => {
    const parts = splitMessageParts({
      content: [
        { type: 'redacted_thinking', data: 'ciphertext' },
        { type: 'text', text: 'Visible' },
      ],
    });
    expect(parts.thinking).toBe('');
    expect(parts.answer).toBe('Visible');
  });

  it('drops a redacted thinking tag and does not keep the secret', () => {
    const parts = splitMessageParts({
      content: 'Before <redacted_thinking>secret</redacted_thinking> after',
    });
    expect(parts.thinking).toBe('');
    expect(parts.answer).toBe('Before  after');
    expect(parts.answer).not.toContain('secret');
  });

  it('cuts an unfinished redacted thinking tag out of the answer', () => {
    const parts = splitMessageParts({
      content: 'Before <redacted_thinking>secret',
    });
    expect(parts.thinking).toBe('');
    expect(parts.answer).toBe('Before ');
    expect(parts.answer).not.toContain('secret');
  });

  it('leaves a normal string answer untouched', () => {
    expect(splitMessageParts({ content: 'Hi there' })).toEqual({
      thinking: '',
      answer: 'Hi there',
    });
  });
});
