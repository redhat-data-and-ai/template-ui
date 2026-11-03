import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentList } from '../DocumentList';
import * as api from '../../../services/documents-api';

/**
 * The volume is 500 MB and a full PVC fails every later write, not
 * just the one that filled it. So capacity has to be visible before
 * it is urgent, rather than appearing for the first time in an error.
 */
beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

const usage = (percent: number, warning: boolean) => ({
  used_bytes: Math.round(524288000 * (percent / 100)),
  capacity_bytes: 524288000,
  percent_used: percent,
  warning,
});

describe('DocumentList', () => {
  it('lists files with their size', async () => {
    vi.spyOn(api, 'listDocuments').mockResolvedValue({
      documents: [{ path: 'sales.csv', bytes: 2048, modified: 0 }],
      usage: usage(1, false),
    });
    render(<DocumentList />);

    expect(await screen.findByText('sales.csv')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('shows how full the volume is', async () => {
    vi.spyOn(api, 'listDocuments').mockResolvedValue({
      documents: [],
      usage: usage(42, false),
    });
    render(<DocumentList />);

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
  });

  it('warns before the volume is full', async () => {
    // Not at the moment it blocks you — by then the upload failed.
    vi.spyOn(api, 'listDocuments').mockResolvedValue({
      documents: [],
      usage: usage(91, true),
    });
    render(<DocumentList />);

    expect(await screen.findByText(/nearly full/i)).toBeInTheDocument();
  });

  it('surfaces the server message when an upload is refused', async () => {
    // A 507 names the numbers; a generic "upload failed" throws away
    // the only part that tells you what to do.
    vi.spyOn(api, 'listDocuments').mockResolvedValue({
      documents: [],
      usage: usage(99, true),
    });
    vi.spyOn(api, 'uploadDocuments').mockRejectedValue(
      new Error('Not enough space: 320.0 MB requested, 5.0 MB free of 500.0 MB.'),
    );
    const { container } = render(<DocumentList />);
    await screen.findByRole('progressbar');

    const input = container.querySelector('input[type="file"]')!;
    const file = new File(['x'], 'big.csv', { type: 'text/csv' });
    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.upload(input as HTMLInputElement, file);

    expect(await screen.findByText(/320.0 MB requested/)).toBeInTheDocument();
  });

  it('surfaces a load failure instead of an empty list', async () => {
    vi.spyOn(api, 'listDocuments').mockRejectedValue(new Error('backend down'));
    render(<DocumentList />);
    expect(await screen.findByText(/backend down/)).toBeInTheDocument();
  });
});
