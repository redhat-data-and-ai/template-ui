import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Rendered markdown has to be styled by a rule that exists.
 *
 * Four components carried `prose prose-sm dark:prose-invert` —
 * including the chat transcript — while `@tailwindcss/typography`
 * was never a dependency, so the built stylesheet contained no
 * `.prose` rule and every one of them was inert. Nothing failed; the
 * markdown just rendered flat, and it read as a design choice rather
 * than a missing plugin.
 */
describe('markdown styling', () => {
  it('references no Tailwind Typography class, since the plugin is absent', () => {
    const offenders = tsxFiles(root).filter((file) => {
      const src = readFileSync(file, 'utf8').replace(/md-prose/g, '');
      return /className="[^"]*\bprose(-sm|-invert)?\b/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('ships real rules for the class the renderers do use', () => {
    const css = readFileSync(resolve(root, 'global.css'), 'utf8');
    expect(css).toMatch(/\.md-prose h1/);
    expect(css).toMatch(/\.md-prose ul/);
  });
});
