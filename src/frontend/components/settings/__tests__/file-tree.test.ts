import { describe, it, expect } from 'vitest';
import { buildFileTree, type TreeFolder } from '../file-tree';

describe('buildFileTree', () => {
  it('groups paths under their folders', () => {
    const tree = buildFileTree([
      'SKILL.md',
      'references/writeup.md',
      'references/rubric.md',
      'evals/evals.json',
    ]);

    expect(tree.map((n) => n.name)).toEqual(['SKILL.md', 'evals', 'references']);
    const refs = tree.find((n) => n.name === 'references') as TreeFolder;
    expect(refs.children.map((c) => c.name)).toEqual([
      'rubric.md',
      'writeup.md',
    ]);
  });

  it('pins SKILL.md above the folders', () => {
    // Alphabetically it sorts under assets/ and evals/, which buries
    // the one file everybody opens the dialog to read.
    const tree = buildFileTree(['evals/evals.json', 'assets/x.txt', 'SKILL.md']);
    expect(tree[0].name).toBe('SKILL.md');
  });

  it('keeps the index so a node maps back to its file', () => {
    const tree = buildFileTree(['SKILL.md', 'references/writeup.md']);
    const refs = tree.find((n) => n.name === 'references') as TreeFolder;
    expect(refs.children[0]).toMatchObject({
      kind: 'file',
      path: 'references/writeup.md',
      index: 1,
    });
  });

  it('nests more than one level deep', () => {
    const tree = buildFileTree(['a/b/c/deep.md']);
    const a = tree[0] as TreeFolder;
    const b = a.children[0] as TreeFolder;
    const c = b.children[0] as TreeFolder;
    expect([a.name, b.name, c.name]).toEqual(['a', 'b', 'c']);
    expect(c.children[0].name).toBe('deep.md');
  });

  it('is empty for no files', () => {
    expect(buildFileTree([])).toEqual([]);
  });
});
