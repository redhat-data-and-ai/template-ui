import { describe, it, expect } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import ja from '../locales/ja.json';
import mi from '../locales/mi.json';
import sw from '../locales/sw.json';
import { LANGUAGES } from '../index';

/**
 * Locale files drift silently: a key added to English renders in
 * English everywhere else via the fallback, which looks like it works
 * and quietly halves the translation. These tests make that drift a
 * build failure instead of a thing somebody notices in a screenshot.
 */

type Tree = Record<string, unknown>;

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`;
    if (value && typeof value === 'object') {
      for (const [k, v] of flatten(value as Tree, `${path}.`)) out.set(k, v);
    } else {
      out.set(path, String(value));
    }
  }
  return out;
}

const LOCALES: Record<string, Tree> = { es, fr, sw, ja, mi };
const source = flatten(en as Tree);

describe('locale files', () => {
  it('declares every bundled locale in LANGUAGES', () => {
    const declared = LANGUAGES.map((l) => l.code).sort();
    expect(declared).toEqual(['en', 'es', 'fr', 'ja', 'mi', 'sw']);
  });

  it('covers every inhabited continent exactly once', () => {
    // The selection rule, pinned. Without this, the next language
    // somebody adds is whichever one they happen to need, and the
    // set drifts back to being all-European by accident.
    const continents = LANGUAGES.map((l) => l.continent).sort();
    expect(continents).toEqual([
      'Africa',
      'Asia',
      'Europe',
      'North America',
      'Oceania',
      'South America',
    ]);
  });

  it('is honest about which translations a human has checked', () => {
    // Model-authored translation is a reasonable starting point and
    // is not the same as correct. The flag exists so a fork can tell
    // the difference without reading the git history.
    const unreviewed = LANGUAGES.filter((l) => !l.reviewed).map((l) => l.code);
    expect(unreviewed).not.toContain('en');
  });

  for (const [code, tree] of Object.entries(LOCALES)) {
    const target = flatten(tree);

    it(`${code} has every key English has`, () => {
      const missing = [...source.keys()].filter((key) => !target.has(key));
      expect(missing).toEqual([]);
    });

    it(`${code} has no keys English does not`, () => {
      // An orphan key is a string that was renamed in English and
      // left behind here — dead weight that looks like coverage.
      const extra = [...target.keys()].filter((key) => !source.has(key));
      expect(extra).toEqual([]);
    });

    it(`${code} keeps every interpolation placeholder`, () => {
      // Dropping {{count}} in translation produces a sentence with a
      // hole in it, and nothing warns.
      const broken: string[] = [];
      for (const [key, englishValue] of source) {
        const expected = englishValue.match(/\{\{\w+\}\}/g)?.sort() ?? [];
        const actual = (target.get(key) ?? '').match(/\{\{\w+\}\}/g)?.sort() ?? [];
        if (JSON.stringify(expected) !== JSON.stringify(actual)) broken.push(key);
      }
      expect(broken).toEqual([]);
    });

    it(`${code} actually translates something`, () => {
      // A locale copied from English passes every test above.
      const identical = [...source].filter(
        ([key, value]) => target.get(key) === value && value.length > 3,
      );
      expect(identical.length).toBeLessThan(source.size / 2);
    });
  }
});
