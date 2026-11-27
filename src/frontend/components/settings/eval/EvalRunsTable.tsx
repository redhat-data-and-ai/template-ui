import { useEffect, useRef, useState } from 'react';
import { Button, Label, Spinner, Title } from '@patternfly/react-core';
import { DownloadIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
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
    <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--sm)' }}>
      <Title headingLevel="h4" size="md">
        Eval Runs
      </Title>
      <Table aria-label="Eval runs" variant="compact">
        <Thead>
          <Tr>
            <Th>Time</Th>
            <Th modifier="fitContent">Score</Th>
            <Th modifier="fitContent">Pass</Th>
            <Th modifier="fitContent">Fail</Th>
            <Th screenReaderText="Download" />
          </Tr>
        </Thead>
        <Tbody>
          {pageRuns.map((run, i) => {
            const pct = Math.round(run.eval_score * 100);
            const isLoading = loadingRow === run.completed_at;
            const hasError = errorRow === run.completed_at;
            const globalIndex = page * PAGE_SIZE + i;

            return (
              <Tr
                key={`${page}_${i}`}
                isClickable
                tabIndex={0}
                role="button"
                aria-label={`View report for run at ${formatTimestamp(run.completed_at)}`}
                onRowClick={(event) => {
                  if ((event?.target as HTMLElement | null)?.closest('button')) return;
                  void handleRowClick(run);
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                    e.preventDefault();
                    void handleRowClick(run);
                  }
                }}
                title="Click to view full report"
              >
                <Td dataLabel="Time">
                  {isLoading && <Spinner size="sm" aria-label="Loading report" />}{' '}
                  {hasError && (
                    <Label isCompact color="red" title="Failed to load report">
                      Failed
                    </Label>
                  )}{' '}
                  {formatTimestamp(run.completed_at)}
                  {globalIndex === 0 && (
                    <>
                      {' '}
                      <Label isCompact>Latest</Label>
                    </>
                  )}
                </Td>
                <Td dataLabel="Score">
                  <Label isCompact color={pct >= 70 ? 'green' : 'red'}>
                    {pct}%
                  </Label>
                </Td>
                <Td dataLabel="Pass">{run.pass}</Td>
                <Td dataLabel="Fail">{run.fail}</Td>
                <Td isActionCell>
                  <Button
                    variant="plain"
                    aria-label="Download JSON"
                    title="Download JSON"
                    icon={<DownloadIcon />}
                    onClick={(e) => void handleDownload(e, run)}
                  />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      {totalPages > 1 && (
        <div className="app-settings__row">
          <span className="app-settings__muted">
            Page {page + 1} of {totalPages}
          </span>
          <div className="app-settings__row">
            <Button variant="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} isDisabled={page === 0}>
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              isDisabled={page === totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
