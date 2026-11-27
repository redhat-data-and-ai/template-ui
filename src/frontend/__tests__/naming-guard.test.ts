import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const FORBIDDEN = /\baif\b|ai[\s-]?factory/i;

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

function collect(): string[] {
  const files = walk(path.join(ROOT, 'src'), ['.ts', '.tsx', '.css']);
  files.push(path.join(ROOT, 'index.html'));
  try {
    files.push(...walk(path.join(ROOT, 'config'), ['.yaml']));
  } catch {
    /* config dir optional */
  }
  try {
    files.push(...walk(path.join(ROOT, 'scripts'), ['.mjs', '.js', '.ts', '.sh']));
  } catch {
    /* scripts dir optional */
  }
  return files;
}

describe('naming guard (neutral public template)', () => {
  it('has no product-specific names in src, index.html, config or scripts', () => {
    const offenders = collect().filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
