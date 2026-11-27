import { useState } from 'react';
import { Edit, Trash2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TestCase, CaseTag } from './eval-dataset-types';

interface EvalDatasetTableProps {
  cases: TestCase[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const TAG_STYLES: Record<CaseTag, string> = {
  non_hitl: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  hitl: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  multi_turn: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const TAG_LABELS: Record<CaseTag, string> = {
  non_hitl: 'non_hitl',
  hitl: 'hitl',
  multi_turn: 'multi_turn',
};

/** Formats an ISO date string into a short locale-aware display string. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Counts the total number of expected tool calls across all turns in a test case. */
function toolCallCount(testCase: TestCase): number {
  return testCase.turns.reduce((sum, t) => sum + (t.toolCallEnabled ? t.expectedToolCalls.length : 0), 0);
}

/** Renders the eval dataset as a table with inline tag badges, tool-call counts, and edit/delete actions. */
export function EvalDatasetTable({ cases, onEdit, onDelete }: EvalDatasetTableProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (cases.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No test cases yet. Click <span className="font-medium text-foreground">Add Test Case</span> to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium bg-secondary/30 rounded-tl-lg">Test Case</th>
            <th className="px-3 py-2.5 font-medium bg-secondary/30">Tag</th>
            <th className="px-3 py-2.5 font-medium text-center bg-secondary/30">Turns</th>
            <th className="px-3 py-2.5 font-medium text-center bg-secondary/30">Tool calls</th>
            <th className="px-3 py-2.5 font-medium bg-secondary/30">Added</th>
            <th className="px-3 py-2.5 w-20 bg-secondary/30 rounded-tr-lg" />
          </tr>
        </thead>
        <tbody>
          {cases.map((tc, rowIdx) => {
            const toolCalls = toolCallCount(tc);
            const isLast = rowIdx === cases.length - 1;
            return (
              <tr key={tc.id} className="hover:bg-secondary/20 transition-colors">
                <td className={cn('px-4 py-3 border-t border-border', isLast && 'rounded-bl-lg')}>
                  <p className="font-medium text-foreground font-mono text-xs">{tc.name}</p>
                  {tc.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tc.description}</p>
                  )}
                </td>
                <td className="px-3 py-3 border-t border-border">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', TAG_STYLES[tc.tag])}>
                      {TAG_LABELS[tc.tag]}
                    </span>
                    {toolCalls > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <Wrench className="w-2.5 h-2.5" />
                        tool_use
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 border-t border-border text-center tabular-nums text-muted-foreground">
                  {tc.turns.length}
                </td>
                <td className="px-3 py-3 border-t border-border text-center tabular-nums text-muted-foreground">
                  {toolCalls > 0 ? toolCalls : '—'}
                </td>
                <td className="px-3 py-3 border-t border-border text-muted-foreground text-xs">
                  {formatDate(tc.createdAt)}
                </td>
                <td className={cn('px-3 py-3 border-t border-border', isLast && 'rounded-br-lg')}>
                  {pendingDelete === tc.id ? (
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => { onDelete(tc.id); setPendingDelete(null); }}
                        className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setPendingDelete(null)}
                        className="px-2 py-0.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => onEdit(tc.id)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors" title="Edit">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setPendingDelete(tc.id)} className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
