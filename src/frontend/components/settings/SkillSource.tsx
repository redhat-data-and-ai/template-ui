import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { Modal, ModalBody, ModalHeader } from '@patternfly/react-core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from '../../lib/markdown-sanitize';
import { buildAgentApiUrl } from '../../lib/app-paths';
import { buildFileTree, type TreeNode } from './file-tree';

interface SkillFile {
  path: string;
  content: string;
  truncated: boolean;
  /** Parsed by the agent, using the loader's own parser. */
  frontmatter?: Record<string, unknown>;
  /** The markdown after the frontmatter. */
  body?: string;
}

/** A frontmatter value, which may be a scalar or a list. */
function Value({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <code
            key={i}
            className="rounded bg-secondary/60 px-1.5 py-0.5 text-[11px] text-foreground"
          >
            {String(v)}
          </code>
        ))}
      </span>
    );
  }
  return <span className="text-foreground/90">{String(value)}</span>;
}

/**
 * A skill's source, read-only.
 *
 * Built rather than pulled in: PatternFly's CodeEditor is Monaco,
 * which is megabytes of editor for something nobody can type into.
 * A gutter and a monospace pane give the same affordance — this is
 * a file, this is its shape — at no bundle cost.
 *
 * Read-only is the point, not a limitation. Skills are config in
 * git; editing them here would put a second source of truth in
 * front of the one that deploys.
 */
/** One node and, for a folder, its children. */
function TreeRow({
  node,
  depth,
  active,
  collapsed,
  onSelect,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  active: number;
  collapsed: Set<string>;
  onSelect: (index: number) => void;
  onToggle: (path: string) => void;
}) {
  // Padding rather than nested margins: a deep tree built from
  // nested containers ends up with the horizontal scrollbar of the
  // deepest branch rather than the widest row.
  const indent = { paddingLeft: `${depth * 0.85 + 0.4}rem` };

  if (node.kind === 'folder') {
    const isOpen = !collapsed.has(node.path);
    return (
      <div role="treeitem" aria-expanded={isOpen}>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          style={indent}
          className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          {isOpen ? (
            <FolderOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate font-mono">{node.name}</span>
        </button>
        {isOpen &&
          node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              active={active}
              collapsed={collapsed}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
      </div>
    );
  }

  const selected = node.index === active;
  return (
    <div role="treeitem" aria-selected={selected}>
      <button
        type="button"
        onClick={() => onSelect(node.index)}
        aria-current={selected}
        style={indent}
        className={`flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-xs transition-colors ${
          selected
            ? 'bg-secondary/70 text-foreground'
            : 'text-muted-foreground hover:bg-secondary/40'
        }`}
      >
        {/* Spacer where a folder's chevron sits, so filenames line up
            with their sibling folders' names rather than their
            chevrons. */}
        <span className="w-3 shrink-0" aria-hidden="true" />
        <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate font-mono">{node.name}</span>
      </button>
    </div>
  );
}

export function SkillSource({
  name,
  endpoint,
  onClose,
}: {
  name: string;
  /** Agent path returning `{files:[...]}`. Defaults to a skill. */
  endpoint?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [active, setActive] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          buildAgentApiUrl(
            endpoint ?? `/skills/${encodeURIComponent(name)}`,
          ),
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
        const body = await res.json();
        if (cancelled) return;
        setFiles(Array.isArray(body?.files) ? body.files : []);
        setActive(0);
        setShowSource(false);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, endpoint]);

  const current = files[active];
  const lines = useMemo(
    () => (current ? current.content.split('\n') : []),
    [current],
  );
  const isMarkdown = Boolean(current?.path.toLowerCase().endsWith('.md'));
  const frontmatter = useMemo(
    () => Object.entries(current?.frontmatter ?? {}),
    [current],
  );
  const tree = useMemo(() => buildFileTree(files.map((f) => f.path)), [files]);

  // Expanded by default. A skill is three or four files; making
  // someone open two folders to find the one they came for is
  // ceremony, not navigation — collapsing is there for the rare
  // skill with a deep references/ directory.
  useEffect(() => setCollapsed(new Set()), [name]);

  return (
    <Modal isOpen variant="large" onClose={onClose} aria-label={name}>
      <ModalHeader title={name} />
      <ModalBody>
        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t('common.loading')}
          </p>
        ) : error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
          >
            {error}
          </div>
        ) : files.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {t('skills.noFiles')}
          </p>
        ) : (
          <div className="flex gap-3" style={{ minHeight: '22rem' }}>
            {/* File list. Hidden when there is only one, because a
                tree of one item is furniture. */}
            {files.length > 1 && (
              <div
                className="w-60 shrink-0 overflow-auto pr-1"
                style={{ maxHeight: '28rem' }}
                role="tree"
                aria-label={t('skills.files')}
              >
                {tree.map((node) => (
                  <TreeRow
                    key={node.path}
                    node={node}
                    depth={0}
                    active={active}
                    collapsed={collapsed}
                    onSelect={setActive}
                    onToggle={(path) =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(path)) next.delete(path);
                        else next.add(path);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            )}

            <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                <code className="truncate text-xs text-muted-foreground">
                  {current?.path}
                </code>
                <span className="flex shrink-0 items-center gap-2">
                  {/* Only offered for files that have a rendered
                      form. A JSON file has one representation and a
                      toggle that does nothing is worse than none. */}
                  {isMarkdown && (
                    <button
                      type="button"
                      onClick={() => setShowSource((v) => !v)}
                      className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
                    >
                      {showSource ? t('skills.rendered') : t('skills.source')}
                    </button>
                  )}
                  <span className="text-[11px] text-muted-foreground/70">
                    {t('skills.readOnly')}
                  </span>
                </span>
              </div>
              <div
                className="overflow-auto"
                style={{ maxHeight: '26rem' }}
                tabIndex={0}
                role="region"
                aria-label={current?.path}
              >
{isMarkdown && !showSource ? (
                  <>
                    {/* Frontmatter above the prose, not inside it. It
                        is a contract the loader reads — name, model,
                        which MCP servers the skill may use — and
                        rendering it as part of the document makes the
                        first thing you see a wall of YAML instead of
                        what the skill is for. */}
                    {frontmatter.length > 0 && (
                      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-b border-border bg-secondary/25 px-4 py-3 text-xs">
                        {frontmatter.map(([key, value]) => (
                          <div key={key} className="contents">
                            <dt className="font-mono text-muted-foreground">{key}</dt>
                            <dd className="m-0 min-w-0">
                              <Value value={value} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <div className="md-prose px-4 py-3 text-sm">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
                      >
                        {current?.body ?? current?.content ?? ''}
                      </ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <table className="w-full border-collapse font-mono text-xs leading-relaxed">
                    <tbody>
                      {lines.map((line, i) => (
                        <tr key={i}>
                          {/* `select-none` on the gutter so copying the
                              pane does not carry line numbers into the
                              clipboard with the code. */}
                          <td className="w-10 select-none border-r border-border px-2 text-right align-top text-muted-foreground/50">
                            {i + 1}
                          </td>
                          <td className="whitespace-pre-wrap break-words px-3 align-top text-foreground/90">
                            {line || ' '}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {current?.truncated && (
                <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                  {t('skills.truncated')}
                </p>
              )}
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
