#!/usr/bin/env node
/**
 * Report components still carrying hard-coded user-facing strings.
 *
 * i18n in an existing UI is never finished in one pass, and the usual
 * failure is that nobody can tell how far it got. This counts what is
 * left, per file, so the remaining work is a number somebody can
 * watch go down rather than a vague "mostly done".
 *
 * Not a lint rule, deliberately. A hard failure on literal JSX text
 * would have to be switched off for every unconverted file, and a
 * rule that is off everywhere is not a rule. `--max=N` is there for
 * when a fork is far enough along to want a ratchet in CI.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath`, not `.pathname`: the latter keeps percent
// encoding, so a checkout under a path with a space resolves to
// nothing, and on Windows it carries a leading slash.
const ROOT = fileURLToPath(new URL('../src/frontend', import.meta.url));

// Attributes that reach a human. `className`, `id`, `key`, `role`,
// `type` and friends never do, and counting them would bury the real
// finds under hundreds of false ones.
const HUMAN_ATTRS = /\b(aria-label|placeholder|title|alt|label|empty)="([^"]{3,})"/g;

// Text between tags: `>Some words<`. Requires a letter and a space or
// a capital, so `>{` and `>)</` and single symbols are skipped.
// The `(?<!=)` rules out `=> Promise<string>` in a type annotation,
// which otherwise reads as the text node "Promise".
const TEXT_NODES = /(?<!=)>\s*([A-Z][A-Za-z][A-Za-z0-9 ,.'’!?—–-]{3,})\s*</g;

// Strings in configuration objects — `{ label: 'Skills', detail: '…' }`.
// These reach a human exactly as JSX text does, but the two patterns
// above cannot see them, and the blind spot is not random: tab bars,
// flag descriptions and toast messages are all built this way. The
// count sat at 280 while 73 more sat in object literals, so the
// number people were watching go down was wrong by a quarter.
//
// Keyed on the property name rather than the value, because a bare
// capitalised string is just as likely to be an icon name, a variant
// or an enum member.
const OBJECT_STRINGS =
  /\b(label|title|detail|description|placeholder|heading|tooltip|summary|message)\s*:\s*(['"])([A-Z][^'"]{3,})\2/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === 'i18n') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.tsx') && !path.endsWith('.test.tsx')) yield path;
  }
}

const rows = [];
let total = 0;

for (const path of walk(ROOT)) {
  const source = readFileSync(path, 'utf8');
  const hits = new Set();
  for (const [, , value] of source.matchAll(HUMAN_ATTRS)) hits.add(value);
  for (const [, value] of source.matchAll(TEXT_NODES)) hits.add(value.trim());
  for (const [, , , value] of source.matchAll(OBJECT_STRINGS)) hits.add(value);
  if (hits.size > 0) {
    rows.push({ file: relative(ROOT, path), count: hits.size });
    total += hits.size;
  }
}

rows.sort((a, b) => b.count - a.count);

const maxArg = process.argv.find((a) => a.startsWith('--max='));
const limit = maxArg ? Number(maxArg.split('=')[1]) : null;

console.log(`Untranslated strings: ${total} across ${rows.length} files\n`);
for (const row of rows.slice(0, 25)) {
  console.log(`  ${String(row.count).padStart(4)}  ${row.file}`);
}
if (rows.length > 25) console.log(`  … and ${rows.length - 25} more files`);

if (limit !== null && total > limit) {
  console.error(`\nFAIL: ${total} untranslated strings exceeds --max=${limit}`);
  process.exit(1);
}
