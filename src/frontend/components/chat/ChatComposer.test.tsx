import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposer } from './ChatComposer';

const setup = (props = {}) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<ChatComposer onSubmit={onSubmit} onCancel={onCancel} placeholder="Enter a prompt for Bot" {...props} />);
  return { onSubmit, onCancel };
};

describe('ChatComposer', () => {
  it('renders a textarea with the placeholder', () => {
    setup();
    expect(screen.getByPlaceholderText('Enter a prompt for Bot').tagName).toBe('TEXTAREA');
  });

  it('submits on Enter and clears', async () => {
    const { onSubmit } = setup();
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'hello{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(box).toHaveValue('');
  });

  it('Shift+Enter inserts a newline instead of submitting', async () => {
    const { onSubmit } = setup();
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('a\nb');
  });

  it('disables send while empty, enables once typed', async () => {
    setup();
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute('type', 'submit');
    await userEvent.type(screen.getByRole('textbox'), 'x');
    expect(send).toBeEnabled();
  });

  it('shows a stop button while streaming, no send', async () => {
    const { onCancel } = setup({ isLoading: true });
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel streaming' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not submit while rate limited', async () => {
    const { onSubmit } = setup({ isRateLimited: true, rateLimitRemainingSeconds: 5 });
    await userEvent.type(screen.getByRole('textbox'), 'hi{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Rate limited. Try again in 5s')).toBeInTheDocument();
  });
});
