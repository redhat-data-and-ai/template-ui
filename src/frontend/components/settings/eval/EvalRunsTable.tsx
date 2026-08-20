import { useState } from 'react';
import { Download } from 'lucide-react';
import { buildAppPath } from '../../../lib/app-paths';
import type { EvalHistoryRun, EvalRow } from './eval-types';

interface EvalRunsTableProps {
  runs: EvalHistoryRun[];
  onViewReport: (result: EvalRow) => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function downloadJson(data: EvalRow, timestamp: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eval-${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchRunDetail(completedAt: string): Promise<EvalRow | null> {
  try {
    const res = await fetch(
      buildAppPath(`/api/proxy/agent/evals/results?completed_at=${encodeURIComponent(completedAt)}`),
      { credentials: 'same-origin' },
    );
    if (!res.ok) return null;
    return (await res.json()) as EvalRow;
  } catch {
    return null;
  }
}

const PAGE_SIZE = 5;

export function EvalRunsTable({ runs, onViewReport }: EvalRunsTableProps) {
  const [loadingRow, setLoadingRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  if (runs.length === 0) return null;

  const totalPages = Math.ceil(runs.length / PAGE_SIZE);
  const pageRuns = runs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleRowClick = async (run: EvalHistoryRun) => {
    setLoadingRow(run.completed_at);
    const detail = await fetchRunDetail(run.completed_at);
    setLoadingRow(null);
    if (detail) onViewReport(detail);
  };

  const handleDownload = async (e: React.MouseEvent, run: EvalHistoryRun) => {
    e.stopPropagation();
    setLoadingRow(run.completed_at);
    const detail = await fetchRunDetail(run.completed_at);
    setLoadingRow(null);
    if (detail) downloadJson(detail, run.completed_at);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Eval Runs
      </p>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium text-right">Score</th>
              <th className="px-3 py-2 font-medium text-right">Pass</th>
              <th className="px-3 py-2 font-medium text-right">Fail</th>
              <th className="px-3 py-2 font-medium text-center w-10"></th>
            </tr>
          </thead>
          <tbody>
            {pageRuns.map((run, i) => {
              const pct = Math.round(run.eval_score * 100);
              const isLoading = loadingRow === run.completed_at;
              const globalIndex = page * PAGE_SIZE + i;

              return (
                <tr
                  key={run.completed_at}
                  onClick={() => handleRowClick(run)}
                  className="border-t border-border cursor-pointer hover:bg-secondary/40 transition-colors"
                  title="Click to view full report"
                >
                  <td className="px-3 py-2.5 text-foreground">
                    {isLoading && (
                      <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse mr-2" />
                    )}
                    {formatTimestamp(run.completed_at)}
                    {globalIndex === 0 && (
                      <span className="ml-2 text-[10px] font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5">
                        Latest
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                    pct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {pct}%
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {run.pass}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {run.fail}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={(e) => handleDownload(e, run)}
                      className="text-muted-foreground hover:text-foreground p-1"
                      title="Download JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
