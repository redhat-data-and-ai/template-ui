export interface TreeFile {
  kind: 'file';
  name: string;
  /** Full path, and the index into the flat file array. */
  path: string;
  index: number;
}

export interface TreeFolder {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeFolder;

/**
 * Turn flat paths into a folder tree.
 *
 * The server returns `['SKILL.md', 'evals/evals.json',
 * 'references/writeup.md']` — correct, and unreadable as a sidebar
 * once a skill has more than a couple of references, because every
 * row repeats its directory.
 *
 * Folders sort before files and both sort alphabetically, except
 * `SKILL.md`, which is pinned to the top: it is the file everyone
 * opens the dialog to read, and alphabetical order would bury it
 * under `assets/` and `evals/`.
 */
export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  paths.forEach((path, index) => {
    const parts = path.split('/').filter(Boolean);
    let level = root;
    let walked = '';

    parts.forEach((part, depth) => {
      walked = walked ? `${walked}/${part}` : part;

      if (depth === parts.length - 1) {
        level.push({ kind: 'file', name: part, path, index });
        return;
      }

      let folder = level.find(
        (n): n is TreeFolder => n.kind === 'folder' && n.name === part,
      );
      if (!folder) {
        folder = { kind: 'folder', name: part, path: walked, children: [] };
        level.push(folder);
      }
      level = folder.children;
    });
  });

  return sortNodes(root);
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  for (const node of nodes) {
    if (node.kind === 'folder') sortNodes(node.children);
  }
  nodes.sort((a, b) => {
    // SKILL.md first, wherever it sits.
    const aPinned = a.kind === 'file' && a.name === 'SKILL.md';
    const bPinned = b.kind === 'file' && b.name === 'SKILL.md';
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}
