import React from 'react';
import { render, screen } from '@testing-library/react';
import { EvalControls } from '../EvalControls';

const defaultProps = {
  onTrigger: vi.fn(),
  isRunning: false,
  triggerState: { status: 'idle' as const, message: '' },
  forceMode: false,
  onForceModeChange: vi.fn(),
};

describe('EvalControls — Dataset button', () => {
  it('does not show a checkmark when the dataset is empty', () => {
    render(<EvalControls {...defaultProps} hasDataset={false} />);
    expect(screen.getByRole('button', { name: 'Dataset' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /has test cases/i })).not.toBeInTheDocument();
  });

  it('shows a green checkmark when the dataset has entries', () => {
    render(<EvalControls {...defaultProps} hasDataset />);
    expect(screen.getByRole('button', { name: 'Dataset (has test cases)' })).toBeInTheDocument();
  });
});
