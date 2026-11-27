import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddTestCaseModal } from '../AddTestCaseModal';

const defaultProps = {
  onSave: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddTestCaseModal — save validation', () => {
  it('shows error and does not call onSave when name is empty', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText('Test Case Name is required.')).toBeInTheDocument();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('shows error when name contains invalid characters', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/Test Case Name/), {
      target: { value: 'ab' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText(/Must start and end with alphanumeric/)).toBeInTheDocument();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('shows error when name is too short', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/Test Case Name/), {
      target: { value: 'ab' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText(/3–20 characters/)).toBeInTheDocument();
  });

  it('shows error and does not call onSave when description is empty', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/Test Case Name/), {
      target: { value: 'valid-name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText('Description is required.')).toBeInTheDocument();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('shows error when user message or expected response is empty', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/Test Case Name/), {
      target: { value: 'valid-name' },
    });
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: { value: 'Validates BMI calculation' },
    });
    // Don't fill in the turn fields — they start empty
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(
      screen.getByText('Each turn requires a user message and expected response.'),
    ).toBeInTheDocument();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('clears error message when save is attempted again', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    // First attempt — triggers error
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText('Test Case Name is required.')).toBeInTheDocument();
    // Fill name and attempt again — error changes
    fireEvent.change(screen.getByLabelText(/Test Case Name/), {
      target: { value: 'valid-name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.queryByText('Test Case Name is required.')).not.toBeInTheDocument();
    expect(screen.getByText('Description is required.')).toBeInTheDocument();
  });
});

describe('AddTestCaseModal — close behaviour', () => {
  it('does not close when clicking the backdrop', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('does not close when Escape is pressed', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the X button is clicked', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the Cancel button is clicked', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });
});

describe('AddTestCaseModal — mode switching', () => {
  it('shows mode toggle buttons in add mode', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Single turn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Multi-turn conversation' })).toBeInTheDocument();
  });

  it('does not show mode toggle in edit mode', () => {
    const initialCase = {
      id: 'case-1',
      name: 'my-case',
      description: '',
      tag: 'non_hitl' as const,
      turns: [{
        id: 't1', userMessage: 'hi', expectedResponse: 'hello',
        expectedIntent: '', expectedKeywords: [],
        toolCallEnabled: false, toolCallOrdered: false, expectedToolCalls: [],
      }],
      createdAt: '2026-08-20T00:00:00.000Z',
    };
    render(<AddTestCaseModal initialCase={initialCase} {...defaultProps} />);
    expect(screen.queryByRole('button', { name: 'Single turn' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Test Case' })).toBeInTheDocument();
  });
});

describe('AddTestCaseModal — form behaviour', () => {
  it('saves a single-turn case with a selected tag and expected tool call', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/Test Case Name/), { target: { value: 'valid-name' } });
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'desc' } });
    fireEvent.click(screen.getByRole('radio', { name: 'HITL approval' }));
    fireEvent.change(screen.getByLabelText(/What does the user ask/), { target: { value: 'hi' } });
    fireEvent.change(screen.getByLabelText(/What should the agent respond with/), { target: { value: 'hello' } });
    // HITL hides the optional tool-call section
    expect(screen.queryByRole('switch', { name: 'Expected tool calls' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Non-HITL' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Expected tool calls' }));
    fireEvent.change(screen.getByLabelText('Tool 1 name'), { target: { value: 'calc' } });
    fireEvent.change(screen.getByLabelText('Tool 1 argument 1 key'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(defaultProps.onSave).toHaveBeenCalledOnce();
    const saved = defaultProps.onSave.mock.calls[0][0];
    expect(saved.tag).toBe('non_hitl');
    expect(saved.turns[0].expectedToolCalls).toEqual([{ toolName: 'calc', arguments: [{ key: 'a', value: '' }] }]);
  });

  it('switches to the multi-turn form and tags the case multi_turn', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Multi-turn conversation' }));
    fireEvent.change(screen.getByLabelText(/Test Case Name/), { target: { value: 'multi-case' } });
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'desc' } });
    fireEvent.change(screen.getByLabelText(/User says/), { target: { value: 'hi' } });
    fireEvent.change(screen.getByLabelText(/Agent should respond/), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add another turn' }));
    expect(screen.getByText('Turn 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText('Each turn requires a user message and expected response.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove turn 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(defaultProps.onSave.mock.calls[0][0].tag).toBe('multi_turn');
  });
});
