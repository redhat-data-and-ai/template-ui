import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FullReportModal } from '../FullReportModal';
import type { EvalRow } from '../eval-types';

function makeResult(tags: (string | undefined)[]): EvalRow {
  return {
    eval_score: 0.8,
    pass: 4,
    fail: 1,
    results_detail: {
      turns: tags.map((tag, i) => ({
        conversation_group_id: `conv_${i}`,
        metric_identifier: 'custom:answer_correctness',
        result: 'PASS',
        score: '1.0',
        reason: 'ok',
        tag,
      })),
    },
  };
}

describe('FullReportModal tag filter', () => {
  it('does not show tag chips when no turns have tags', () => {
    render(
      <FullReportModal result={makeResult([undefined, undefined])} prevScore={null} onClose={() => {}} />
    );
    // "All" chip only exists when availableTags is non-empty
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });

  it('shows tag chips when turns have tags', () => {
    render(
      <FullReportModal result={makeResult(['hitl', 'tool_use'])} prevScore={null} onClose={() => {}} />
    );
    // target chip buttons specifically — conv header badges have the same text
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hitl' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tool Use' })).toBeInTheDocument();
  });

  it('filters conversations when a tag chip is clicked', () => {
    render(
      <FullReportModal result={makeResult(['hitl', 'tool_use'])} prevScore={null} onClose={() => {}} />
    );
    // click the chip button, not the header badge
    fireEvent.click(screen.getByRole('button', { name: 'Hitl' }));
    // conv_0 (hitl) visible, conv_1 (tool_use) hidden
    // use /Conv 0/ regex because header button text includes the badge label
    expect(screen.getByRole('button', { name: /Conv 0/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conv 1/ })).not.toBeInTheDocument();
  });

  it('resets to all conversations when All chip is clicked', () => {
    render(
      <FullReportModal result={makeResult(['hitl', 'tool_use'])} prevScore={null} onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hitl' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: /Conv 0/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conv 1/ })).toBeInTheDocument();
  });
});
