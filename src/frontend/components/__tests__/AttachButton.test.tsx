import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachButton } from '../AttachButton';
import * as api from '../../services/attachments-api';

const file = (name: string) => new File(['x,y\n1,2'], name, { type: 'text/csv' });

function setup(props: Partial<React.ComponentProps<typeof AttachButton>> = {}) {
  const onUploaded = vi.fn();
  const onError = vi.fn();
  render(
    <AttachButton threadId="t1" onUploaded={onUploaded} onError={onError} {...props} />,
  );
  return { onUploaded, onError };
}

describe('AttachButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads the chosen files to the thread', async () => {
    const spy = vi.spyOn(api, 'uploadAttachments').mockResolvedValue({
      attachments: [
        { filename: 'a.csv', path: '/uploads/a.csv', bytes: 7, text_extracted: true, truncated: false },
      ],
      summary: '[attached csv: a.csv, 1 KB]',
    });
    const { onUploaded } = setup();

    await userEvent.upload(
      document.querySelector('input[type=file]') as HTMLInputElement,
      file('a.csv'),
    );

    await waitFor(() => expect(spy).toHaveBeenCalledWith('t1', [expect.any(File)]));
    expect(onUploaded).toHaveBeenCalledWith(expect.any(Array), '[attached csv: a.csv, 1 KB]');
  });

  it('surfaces the server message, which names the file and the limit', async () => {
    vi.spyOn(api, 'uploadAttachments').mockRejectedValue(
      new Error('big.csv: exceeds 10485760 bytes'),
    );
    const { onError, onUploaded } = setup();

    await userEvent.upload(
      document.querySelector('input[type=file]') as HTMLInputElement,
      file('big.csv'),
    );

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('big.csv: exceeds 10485760 bytes'),
    );
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('re-enables after a failure so the user can retry', async () => {
    vi.spyOn(api, 'uploadAttachments').mockRejectedValue(new Error('boom'));
    setup();

    await userEvent.upload(
      document.querySelector('input[type=file]') as HTMLInputElement,
      file('a.csv'),
    );

    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled());
  });

  it('clears the input so the same file can be picked twice', async () => {
    vi.spyOn(api, 'uploadAttachments').mockResolvedValue({ attachments: [], summary: '' });
    setup();

    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await userEvent.upload(input, file('a.csv'));

    await waitFor(() => expect(input.value).toBe(''));
  });

  it('has an accessible name', () => {
    setup();
    expect(screen.getByRole('button', { name: /attach files/i })).toBeInTheDocument();
  });

  it('respects disabled', () => {
    setup({ disabled: true });
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('InputForm integration', () => {
  it('shows the attach button only when there is a thread to attach to', async () => {
    const { InputForm } = await import('../InputForm');
    const noop = () => {};

    const { rerender } = render(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} />,
    );
    expect(screen.queryByRole('button', { name: /attach files/i })).toBeNull();

    rerender(
      <InputForm onSubmit={noop} onCancel={noop} isLoading={false} threadId="t1" />,
    );
    expect(screen.getByRole('button', { name: /attach files/i })).toBeInTheDocument();
  });

  it('lists what was attached, so the upload is visible', async () => {
    const { InputForm } = await import('../InputForm');
    vi.spyOn(api, 'uploadAttachments').mockResolvedValue({
      attachments: [
        { filename: 'notes.md', path: '/uploads/notes.md', bytes: 12, text_extracted: true, truncated: false },
      ],
      summary: '[attached md: notes.md, 1 KB]',
    });

    render(<InputForm onSubmit={() => {}} onCancel={() => {}} isLoading={false} threadId="t1" />);
    await userEvent.upload(
      document.querySelector('input[type=file]') as HTMLInputElement,
      file('notes.md'),
    );

    await waitFor(() =>
      expect(within(screen.getByLabelText(/attached files/i)).getByText('notes.md')).toBeInTheDocument(),
    );
  });

  it('flags a file the model can only partly read', async () => {
    const { InputForm } = await import('../InputForm');
    vi.spyOn(api, 'uploadAttachments').mockResolvedValue({
      attachments: [
        { filename: 'big.log', path: '/uploads/big.log', bytes: 99, text_extracted: true, truncated: true },
      ],
      summary: '',
    });

    render(<InputForm onSubmit={() => {}} onCancel={() => {}} isLoading={false} threadId="t1" />);
    await userEvent.upload(
      document.querySelector('input[type=file]') as HTMLInputElement,
      file('big.log'),
    );

    // The user believes the model has the whole file; it does not.
    await waitFor(() => expect(screen.getByText(/truncated/i)).toBeInTheDocument());
  });
});
