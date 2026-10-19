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

type Props = { className?: string; children?: ReactNode } & Record<string, unknown>;

export const markdownComponentsCompact = {
  h1: ({ className, children, ...p }: Props) => (
    <h1 className={cn('text-sm font-semibold mt-3 mb-1 text-foreground', className)} {...p}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...p }: Props) => (
    <h2 className={cn('text-sm font-semibold mt-3 mb-1 text-foreground', className)} {...p}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...p }: Props) => (
    <h3 className={cn('text-xs font-semibold mt-2 mb-1 text-foreground', className)} {...p}>
      {children}
    </h3>
  ),
  p: ({ className, children, ...p }: Props) => (
    <p className={cn('text-xs leading-relaxed mb-2 text-foreground', className)} {...p}>
      {children}
    </p>
  ),
  ul: ({ className, children, ...p }: Props) => (
    <ul className={cn('list-disc pl-4 mb-2 space-y-0.5 text-xs', className)} {...p}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...p }: Props) => (
    <ol className={cn('list-decimal pl-4 mb-2 space-y-0.5 text-xs', className)} {...p}>
      {children}
    </ol>
  ),
  li: ({ className, children, ...p }: Props) => (
    <li className={cn('text-xs text-foreground', className)} {...p}>
      {children}
    </li>
  ),
  code: ({ className, children, ...p }: Props) => (
    <code
      className={cn('text-[11px] font-mono bg-background/60 px-1 py-0.5 rounded', className)}
      {...p}
    >
      {children}
    </code>
  ),
  pre: ({ className, children, ...p }: Props) => (
    <pre
      className={cn(
        'text-[11px] font-mono bg-background/60 p-2 rounded overflow-auto mb-2',
        className,
      )}
      {...p}
    >
      {children}
    </pre>
  ),
  // Tables are why this matters most: a report of merge requests is
  // a table, and as raw text it is a wall of pipes.
  table: ({ className, children, ...p }: Props) => (
    <div className="overflow-x-auto mb-2">
      <table className={cn('text-[11px] w-full border-collapse', className)} {...p}>
        {children}
      </table>
    </div>
  ),
  th: ({ className, children, ...p }: Props) => (
    <th
      className={cn(
        'text-left font-medium px-2 py-1 border-b border-border text-muted-foreground',
        className,
      )}
      {...p}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...p }: Props) => (
    <td className={cn('px-2 py-1 border-b border-border/50 align-top', className)} {...p}>
      {children}
    </td>
  ),
  a: ({ className, children, ...p }: Props) => (
    <a
      className={cn('text-primary underline underline-offset-2', className)}
      target="_blank"
      rel="noopener noreferrer"
      {...p}
    >
      {children}
    </a>
  ),
};
