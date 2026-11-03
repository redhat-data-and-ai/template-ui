import type { ExtraProps } from 'react-markdown';
import type { ReactNode } from 'react';
import { cn } from './utils';

/**
 * Markdown for a nested panel, not a whole message.
 *
 * The subagent result used to render as raw text in a monospace
 * block, so a report full of `###` headings and `|` tables arrived
 * as the literal characters. It is markdown; it should read as
 * markdown.
 *
 * Scaled down deliberately. The main chat's components size an
 * `h1` at `text-2xl`, which inside a subagent card competes with
 * the card's own title — the result is subordinate to the answer
 * that quotes it, and should look it.
 */

// `node` is the hast node react-markdown hands every custom
// component. Spreading it onto the element emits
// `node="[object Object]"` and a React warning per render, so
// every component below destructures it away.
type Props = {
  className?: string;
  children?: ReactNode;
  // Typed from react-markdown's own ExtraProps so these components
  // stay assignable to `Components`.
  node?: ExtraProps['node'];
} & Record<string, unknown>;

export const markdownComponentsCompact = {
  h1: ({ className, children, node: _node, ...rest }: Props) => (
    <h1 className={cn('text-sm font-semibold mt-3 mb-1 text-foreground', className)} {...rest}>
      {children}
    </h1>
  ),
  h2: ({ className, children, node: _node, ...rest }: Props) => (
    <h2 className={cn('text-sm font-semibold mt-3 mb-1 text-foreground', className)} {...rest}>
      {children}
    </h2>
  ),
  h3: ({ className, children, node: _node, ...rest }: Props) => (
    <h3 className={cn('text-xs font-semibold mt-2 mb-1 text-foreground', className)} {...rest}>
      {children}
    </h3>
  ),
  p: ({ className, children, node: _node, ...rest }: Props) => (
    <p className={cn('text-xs leading-relaxed mb-2 text-foreground', className)} {...rest}>
      {children}
    </p>
  ),
  ul: ({ className, children, node: _node, ...rest }: Props) => (
    <ul className={cn('list-disc pl-4 mb-2 space-y-0.5 text-xs', className)} {...rest}>
      {children}
    </ul>
  ),
  ol: ({ className, children, node: _node, ...rest }: Props) => (
    <ol className={cn('list-decimal pl-4 mb-2 space-y-0.5 text-xs', className)} {...rest}>
      {children}
    </ol>
  ),
  li: ({ className, children, node: _node, ...rest }: Props) => (
    <li className={cn('text-xs text-foreground', className)} {...rest}>
      {children}
    </li>
  ),
  code: ({ className, children, node: _node, ...rest }: Props) => (
    <code
      className={cn('text-[11px] font-mono bg-background/60 px-1 py-0.5 rounded', className)}
      {...rest}
    >
      {children}
    </code>
  ),
  pre: ({ className, children, node: _node, ...rest }: Props) => (
    <pre
      className={cn(
        'text-[11px] font-mono bg-background/60 p-2 rounded overflow-auto mb-2',
        className,
      )}
      {...rest}
    >
      {children}
    </pre>
  ),
  // Tables are why this matters most: a report of merge requests is
  // a table, and as raw text it is a wall of pipes.
  table: ({ className, children, node: _node, ...rest }: Props) => (
    <div className="overflow-x-auto mb-2">
      <table className={cn('text-[11px] w-full border-collapse', className)} {...rest}>
        {children}
      </table>
    </div>
  ),
  th: ({ className, children, node: _node, ...rest }: Props) => (
    <th
      className={cn(
        'text-left font-medium px-2 py-1 border-b border-border text-muted-foreground',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  ),
  td: ({ className, children, node: _node, ...rest }: Props) => (
    <td className={cn('px-2 py-1 border-b border-border/50 align-top', className)} {...rest}>
      {children}
    </td>
  ),
  a: ({ className, children, node: _node, ...rest }: Props) => (
    <a
      className={cn('text-primary underline underline-offset-2', className)}
      target="_blank"
      rel="noopener noreferrer"
      {...rest}
    >
      {children}
    </a>
  ),
};
