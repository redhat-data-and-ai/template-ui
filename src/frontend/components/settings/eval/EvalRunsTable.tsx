import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { buildAppPath } from '../../../lib/app-paths';
import type { EvalHistoryRun, EvalRow } from './eval-types';

interface EvalRunsTableProps {
  runs: EvalHistoryRun[];
  onViewReport: (result: EvalRow) => void;
}

/** Formats an ISO timestamp into a short locale-aware date-time string. */
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

/** Creates a temporary download link and saves an EvalRow as a JSON file. */
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

/** Fetches the full eval result detail for a specific run by its completion timestamp. */
async function fetchRunDetail(completedAt: string, signal: AbortSignal): Promise<EvalRow | null> {
  try {
    const res = await fetch(
      buildAppPath(`/api/proxy/agent/evals/results?completed_at=${encodeURIComponent(completedAt)}`),
      { credentials: 'same-origin', signal },
    );
    if (!res.ok) return null;
    return (await res.json()) as EvalRow;
  } catch {
    return null;
  }
}

const PAGE_SIZE = 5;

/** Paginated table of eval runs with click-to-view-report and JSON download. */
export function EvalRunsTable({ runs, onViewReport }: EvalRunsTableProps) {
  const [loadingRow, setLoadingRow] = useState<string | null>(null);
  const [errorRow, setErrorRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    setPage((prev) => {
      const maxPage = Math.max(0, Math.ceil(runs.length / PAGE_SIZE) - 1);
      return prev > maxPage ? maxPage : prev;
    });
  }, [runs.length]);

  if (runs.length === 0) return null;

  const totalPages = Math.ceil(runs.length / PAGE_SIZE);
  const pageRuns = runs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleRowClick = async (run: EvalHistoryRun) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setErrorRow(null);
    setLoadingRow(run.completed_at);
    const detail = await fetchRunDetail(run.completed_at, ac.signal);
    if (ac.signal.aborted) return;
    setLoadingRow(null);
    if (detail) {
      onViewReport(detail);
    } else {
      setErrorRow(run.completed_at);
    }
  };

  const handleDownload = async (e: React.MouseEvent, run: EvalHistoryRun) => {
    e.stopPropagation();
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setErrorRow(null);
    setLoadingRow(run.completed_at);
    const detail = await fetchRunDetail(run.completed_at, ac.signal);
    if (ac.signal.aborted) return;
    setLoadingRow(null);
    if (detail) {
      downloadJson(detail, run.completed_at);
    } else {
      setErrorRow(run.completed_at);
    }
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
              const hasError = errorRow === run.completed_at;
              const globalIndex = page * PAGE_SIZE + i;

              return (
                <tr
                  key={`${page}_${i}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`View report for run at ${formatTimestamp(run.completed_at)}`}
                  onClick={() => handleRowClick(run)}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); handleRowClick(run); } }}
                  className="border-t border-border cursor-pointer hover:bg-secondary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors"
                  title="Click to view full report"
                >
                  <td className="px-3 py-2.5 text-foreground">
                    {isLoading && (
                      <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse mr-2" />
                    )}
                    {hasError && (
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2" title="Failed to load report" />
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
