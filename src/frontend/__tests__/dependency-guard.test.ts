import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const srcDir = path.join(root, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const sourceFiles = walk(srcDir).filter(
  (f) => /\.(tsx?|css)$/.test(f) && !f.includes('__tests__') && !/\.test\.tsx?$/.test(f),
);
const tsxFiles = sourceFiles.filter((f) => f.endsWith('.tsx'));

const REMOVED = [
  'lucide-react',
  'tailwind-merge',
  'clsx',
  'class-variance-authority',
  'tailwindcss',
  '@tailwindcss/vite',
  'tw-animate-css',
];

// Anchored, so PatternFly classes such as `pf-v6-l-flex` never match.
const TAILWIND_TOKEN =
  /^(flex|inline-flex|grid|hidden|block|inline-block|relative|absolute|fixed|sticky|truncate|shrink-0|grow|sr-only|italic|underline|uppercase|capitalize|border|rounded|shadow|(-?(p|m)[xytrbl]?-(\d+(\.\d+)?|px|auto))|text-(xs|sm|base|lg|xl|\dxl|left|center|right)|font-(medium|semibold|bold|normal|mono|sans)|(bg|text|border|rounded|shadow|gap|space-[xy]|w|h|min-w|max-w|min-h|max-h|size|items|justify|self|flex|grid|col|row|overflow|opacity|z|inset|top|bottom|left|right|leading|tracking|animate|transition|duration|cursor|whitespace|break|object|line-clamp|ring|outline|divide|order|basis|grow|shrink|animation-delay)-.+)$/;

function classNameStrings(source: string): string[] {
  const out: string[] = [];
  const re = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '');
  // string literals inside className={...} expressions (ternaries, cn-like joins)
  const expr = /className\s*=\s*\{([^}]*)\}/g;
  while ((m = expr.exec(source))) {
    for (const s of m[1].matchAll(/["'`]([^"'`]*)["'`]/g)) out.push(s[1]);
  }
  return out;
}

describe('dependency guard', () => {
  it('no source file imports removed UI libraries', () => {
    const offenders = sourceFiles.filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return /from\s+['"](lucide-react|tailwind-merge|clsx|class-variance-authority)['"]/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('package.json lists none of the removed packages', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(REMOVED.filter((name) => name in all)).toEqual([]);
  });

  it('index.html does not load Tailwind', () => {
    expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).not.toMatch(/tailwindcss/i);
  });

  it('build config and stylesheets no longer reference Tailwind', () => {
    expect(fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')).not.toMatch(/tailwind/i);
    const cssOffenders = sourceFiles
      .filter((f) => f.endsWith('.css'))
      .filter((f) => /@import\s+["']tailwindcss|tw-animate-css|@apply|@custom-variant|@theme/.test(fs.readFileSync(f, 'utf8')));
    expect(cssOffenders).toEqual([]);
  });

  it('no .tsx className uses a Tailwind utility token', () => {
    const offenders: string[] = [];
    for (const f of tsxFiles) {
      for (const value of classNameStrings(fs.readFileSync(f, 'utf8'))) {
        for (const raw of value.split(/\s+/).filter(Boolean)) {
          // Drop variant prefixes (hover:, md:, dark:, lg:flex ...).
          const token = raw.replace(/^(?:[a-z0-9-]+:)+/, '');
          if (TAILWIND_TOKEN.test(token)) offenders.push(`${path.relative(root, f)}: ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
