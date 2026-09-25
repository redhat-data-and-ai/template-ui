import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InputForm } from './InputForm';

describe('InputForm — keep text when submit is rejected', () => {
  it('clears the textarea when onSubmit succeeds', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <InputForm onSubmit={onSubmit} onCancel={() => {}} isLoading={false} hasHistory={false} />,
    );

    const box = screen.getByRole('textbox', { name: /type a message/i });
    await user.type(box, 'hello');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(box).toHaveValue('');
  });

  it('keeps the typed message when onSubmit returns false', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(
      <InputForm onSubmit={onSubmit} onCancel={() => {}} isLoading={false} hasHistory={false} />,
    );

    const box = screen.getByRole('textbox', { name: /type a message/i });
    await user.type(box, 'keep me');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(onSubmit).toHaveBeenCalledWith('keep me');
    expect(box).toHaveValue('keep me');
  });
});
