import type { Message } from '@langchain/langgraph-sdk';

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: unknown) => {
        if (typeof b === 'string') return b;
        if (b && typeof b === 'object' && 'type' in b && 'text' in b) {
          const block = b as { type: string; text: string };
          if (block.type === 'text' && typeof block.text === 'string') return block.text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

export function exportAsMarkdown(messages: Message[], title: string): string {
  const lines: string[] = [`# ${title}`, ''];
  for (const m of messages) {
    if (m.type === 'tool') continue;
    const role =
      m.type === 'human' ? 'Human' : m.type === 'ai' ? 'Assistant' : String(m.type);
    lines.push(`## ${role}`, '', extractMessageText(m.content), '');
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function exportAsJSON(messages: Message[], title: string): string {
  return JSON.stringify({ title, exportedAt: new Date().toISOString(), messages }, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function slugifyExportBase(title: string): string {
  const s = title.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return s.length > 0 ? s.slice(0, 80) : 'chat';
}
