import { useState } from 'react';
import { Button, EmptyState, EmptyStateBody, Label } from '@patternfly/react-core';
import { PencilAltIcon, TrashIcon, WrenchIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { TestCase } from './eval-dataset-types';

interface EvalDatasetTableProps {
  cases: TestCase[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Formats an ISO date string into a short locale-aware display string. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Counts the total number of expected tool calls across all turns in a test case. */
function toolCallCount(testCase: TestCase): number {
  return testCase.turns.reduce((sum, t) => sum + (t.toolCallEnabled ? t.expectedToolCalls.length : 0), 0);
}

/** Renders the eval dataset as a PatternFly table with tag labels, tool-call counts, and edit/delete actions. */
export function EvalDatasetTable({ cases, onEdit, onDelete }: EvalDatasetTableProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (cases.length === 0) {
    return (
      <EmptyState titleText="No test cases" headingLevel="h2" variant="sm">
        <EmptyStateBody>
          No test cases yet. Click <strong>Add Test Case</strong> to get started.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <Table aria-label="Eval test cases" variant="compact">
      <Thead>
        <Tr>
          <Th>Test Case</Th>
          <Th>Tag</Th>
          <Th textCenter>Turns</Th>
          <Th textCenter>Tool calls</Th>
          <Th>Added</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {cases.map((tc) => {
          const toolCalls = toolCallCount(tc);
          return (
            <Tr key={tc.id}>
              <Td dataLabel="Test Case">
                <div className="app-eval__name">{tc.name}</div>
                {tc.description && <div className="app-eval__desc">{tc.description}</div>}
              </Td>
              <Td dataLabel="Tag">
                <div className="app-eval__tags">
                  <Label isCompact variant="outline">{tc.tag}</Label>
                  {toolCalls > 0 && (
                    <Label isCompact variant="outline" icon={<WrenchIcon />}>tool_use</Label>
                  )}
                </div>
              </Td>
              <Td dataLabel="Turns" textCenter>{tc.turns.length}</Td>
              <Td dataLabel="Tool calls" textCenter>{toolCalls > 0 ? toolCalls : '—'}</Td>
              <Td dataLabel="Added" className="app-eval__muted">{formatDate(tc.createdAt)}</Td>
              <Td isActionCell>
                {pendingDelete === tc.id ? (
                  <div className="app-eval__row-actions">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => { onDelete(tc.id); setPendingDelete(null); }}
                    >
                      Delete
                    </Button>
                    <Button variant="link" size="sm" onClick={() => setPendingDelete(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="app-eval__row-actions">
                    <Button
                      variant="plain"
                      aria-label={`Edit ${tc.name}`}
                      icon={<PencilAltIcon />}
                      onClick={() => onEdit(tc.id)}
                    />
                    <Button
                      variant="plain"
                      aria-label={`Delete ${tc.name}`}
                      icon={<TrashIcon />}
                      onClick={() => setPendingDelete(tc.id)}
                    />
                  </div>
                )}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}
