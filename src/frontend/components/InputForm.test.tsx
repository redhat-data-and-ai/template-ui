import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InputForm } from './InputForm';

vi.mock('./subagentSlash', async () => {
  const actual = await vi.importActual<typeof import('./subagentSlash')>('./subagentSlash');
  return {
    ...actual,
    fetchMentionCatalog: vi.fn(),
  };
});

import { fetchMentionCatalog } from './subagentSlash';

const mentions = [
  { name: 'analyst', description: 'Calculates BMI' },
  { name: 'publisher', description: 'Sends email' },
  { name: 'asker', description: 'Asks a question' },
];

describe('InputForm — subagent slash menu', () => {
  beforeEach(() => {
    vi.mocked(fetchMentionCatalog).mockReset();
    vi.mocked(fetchMentionCatalog).mockResolvedValue(mentions);
  });

  it('opens the menu when typing / at a word start', async () => {
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });
    await user.type(input, '/');

    expect(await screen.findByRole('listbox', { name: /subagents/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /\/analyst/i })).toBeInTheDocument();
    });
    expect(fetchMentionCatalog).toHaveBeenCalled();
  });

  it('filters options as the query grows', async () => {
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });
    await user.type(input, '/pub');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /\/publisher/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /\/analyst/i })).not.toBeInTheDocument();
  });

  it('fetches again when the menu re-opens', async () => {
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/');
    await screen.findByRole('listbox', { name: /subagents/i });
    expect(fetchMentionCatalog).toHaveBeenCalledTimes(1);

    await user.type(input, '{backspace}hello /');
    await waitFor(() => {
      expect(fetchMentionCatalog).toHaveBeenCalledTimes(2);
    });
  });

  it('does not reuse the first catalog after a failed second fetch', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMentionCatalog)
      .mockResolvedValueOnce(mentions)
      .mockRejectedValueOnce(new Error('network'));

    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/');
    await screen.findByRole('option', { name: /\/analyst/i });

    await user.type(input, '{backspace}x /');
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load subagents/i);
    expect(screen.queryByRole('option', { name: /\/analyst/i })).not.toBeInTheDocument();
  });

  it('does not send the message when Enter is pressed before the list is ready', async () => {
    vi.mocked(fetchMentionCatalog).mockReturnValue(new Promise(() => {}));
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/pub');
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.textContent).toBe('/pub');
  });

  it('sends an unknown slash token on Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/tmp');
    expect(await screen.findByText(/no matching subagents/i)).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('/tmp');
  });

  it('colors a finished name when the list arrives after the menu closes', async () => {
    let resolveCatalog: (value: typeof mentions) => void = () => {};
    vi.mocked(fetchMentionCatalog).mockReturnValue(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/analyst ');
    resolveCatalog(mentions);

    await waitFor(() => {
      expect(input.querySelector('.text-primary')).toHaveTextContent('/analyst');
    });
  });

  it('replaces selected text when pasting', async () => {
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, 'hello');
    input.focus();
    window.getSelection()?.selectAllChildren(input);
    await user.paste('yo');

    expect(input.textContent).toBe('yo');
  });

  it('inserts /name on Enter without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/');
    await screen.findByRole('option', { name: /\/analyst/i });
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.textContent).toBe('/analyst ');
    expect(input.querySelector('.text-primary')).toHaveTextContent('/analyst');
  });

  it('inserts the highlighted name on Tab without leaving the box', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/pub');
    await screen.findByRole('option', { name: /\/publisher/i });
    await user.keyboard('{Tab}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.textContent).toBe('/publisher ');
    expect(input).toHaveFocus();
  });

  it('shows a line break on the first Shift+Enter after Tab', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/pub');
    await screen.findByRole('option', { name: /\/publisher/i });
    await user.keyboard('{Tab}');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.querySelector('br')).toBeInTheDocument();
    expect(input.textContent?.replace(/\u200b/g, '')).toBe('/publisher ');
  });

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, '/');
    await screen.findByRole('listbox', { name: /subagents/i });
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox', { name: /subagents/i })).not.toBeInTheDocument();
    expect(input.textContent).toBe('/');
  });

  it('does not open the menu for foo/bar', async () => {
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const input = screen.getByRole('textbox', { name: /type a message/i });

    await user.type(input, 'foo/bar');
    expect(screen.queryByRole('listbox', { name: /subagents/i })).not.toBeInTheDocument();
    expect(fetchMentionCatalog).not.toHaveBeenCalled();
  });
});
