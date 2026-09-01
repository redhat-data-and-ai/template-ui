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

  it('shows error when name contains spaces or special characters', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. calculate_bmi_standard'), {
      target: { value: 'Invalid Name!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText(/lowercase letters, digits, and underscores/)).toBeInTheDocument();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('shows error when name contains uppercase letters', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. calculate_bmi_standard'), {
      target: { value: 'MyCase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText(/lowercase letters, digits, and underscores/)).toBeInTheDocument();
  });

  it('shows error and does not call onSave when description is empty', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. calculate_bmi_standard'), {
      target: { value: 'valid_name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.getByText('Description is required.')).toBeInTheDocument();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('shows error when user message or expected response is empty', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. calculate_bmi_standard'), {
      target: { value: 'valid_name' },
    });
    fireEvent.change(screen.getByPlaceholderText('Brief description of what this test case validates'), {
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
    fireEvent.change(screen.getByPlaceholderText('e.g. calculate_bmi_standard'), {
      target: { value: 'valid_name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));
    expect(screen.queryByText('Test Case Name is required.')).not.toBeInTheDocument();
    expect(screen.getByText('Description is required.')).toBeInTheDocument();
  });
});

describe('AddTestCaseModal — close behaviour', () => {
  it('does not close when clicking the backdrop', () => {
    render(<AddTestCaseModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('test-case-modal-backdrop'));
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
      name: 'my_case',
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
