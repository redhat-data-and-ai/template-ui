import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAsMarkdown, exportAsJSON, downloadFile, slugifyExportBase } from './export-chat';

describe('export-chat', () => {
  describe('exportAsMarkdown', () => {
    it('formats human and ai messages with role headers', () => {
      const messages = [
        { type: 'human', content: 'Hello' },
        { type: 'ai', content: 'Hi there!' },
      ] as any;
      const md = exportAsMarkdown(messages, 'Test Chat');
      expect(md).toContain('# Test Chat');
      expect(md).toContain('## Human');
      expect(md).toContain('Hello');
      expect(md).toContain('## Assistant');
      expect(md).toContain('Hi there!');
    });

    it('skips tool messages', () => {
      const messages = [
        { type: 'human', content: 'Hello' },
        { type: 'tool', content: 'tool result' },
        { type: 'ai', content: 'Response' },
      ] as any;
      const md = exportAsMarkdown(messages, 'Chat');
      expect(md).not.toContain('tool result');
    });

    it('extracts text from structured content blocks', () => {
      const messages = [
        {
          type: 'ai',
          content: [{ type: 'text', text: 'block content' }],
        },
      ] as any;
      const md = exportAsMarkdown(messages, 'Chat');
      expect(md).toContain('block content');
    });

    it('handles string array content', () => {
      const messages = [
        { type: 'ai', content: ['part1', 'part2'] },
      ] as any;
      const md = exportAsMarkdown(messages, 'Chat');
      expect(md).toContain('part1part2');
    });

    it('handles empty content', () => {
      const messages = [
        { type: 'ai', content: '' },
      ] as any;
      const md = exportAsMarkdown(messages, 'Chat');
      expect(md).toContain('## Assistant');
    });

    it('handles non-string non-array content', () => {
      const messages = [
        { type: 'ai', content: 42 },
      ] as any;
      const md = exportAsMarkdown(messages, 'Chat');
      expect(md).toContain('## Assistant');
    });

    it('labels unknown message types by their type', () => {
      const messages = [
        { type: 'system', content: 'sys msg' },
      ] as any;
      const md = exportAsMarkdown(messages, 'Chat');
      expect(md).toContain('## system');
    });
  });

  describe('exportAsJSON', () => {
    it('returns JSON with title, exportedAt, and messages', () => {
      const messages = [{ type: 'human', content: 'hi' }] as any;
      const result = JSON.parse(exportAsJSON(messages, 'My Chat'));
      expect(result.title).toBe('My Chat');
      expect(result.exportedAt).toBeTruthy();
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('downloadFile', () => {
    it('creates a blob download link and clicks it', () => {
      const clickSpy = vi.fn();
      const removeSpy = vi.fn();
      const revokeUrl = vi.fn();

      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(v: string) { /* noop */ },
        set download(v: string) { /* noop */ },
        click: clickSpy,
        remove: removeSpy,
      } as any);

      vi.spyOn(document.body, 'appendChild').mockImplementation((el) => el);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl);

      downloadFile('content', 'file.md', 'text/markdown');

      expect(clickSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });
  });

  describe('slugifyExportBase', () => {
    it('converts spaces and special chars to hyphens', () => {
      expect(slugifyExportBase('Hello World!')).toBe('Hello-World');
    });

    it('trims leading/trailing hyphens', () => {
      expect(slugifyExportBase('---test---')).toBe('test');
    });

    it('returns "chat" for empty input', () => {
      expect(slugifyExportBase('')).toBe('chat');
      expect(slugifyExportBase('   ')).toBe('chat');
    });

    it('truncates to 80 characters', () => {
      const long = 'a'.repeat(100);
      expect(slugifyExportBase(long).length).toBe(80);
    });

    it('returns "chat" when all chars are special', () => {
      expect(slugifyExportBase('!@#$%')).toBe('chat');
    });
  });
});
