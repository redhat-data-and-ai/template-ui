import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConsentPage } from './ConsentPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('ConsentPage', () => {
  it('renders authorization page', () => {
    const { getByText } = render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );
    expect(getByText('Authorization Required')).toBeDefined();
    expect(getByText('Approve & Continue')).toBeDefined();
    expect(getByText('Deny')).toBeDefined();
  });

  it('shows error when deny is clicked', () => {
    const { getByText } = render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );

    fireEvent.click(getByText('Deny'));
    expect(getByText(/must approve/)).toBeDefined();
  });

  it('calls API on approve', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ redirectUrl: '/' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { getByText } = render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );

    fireEvent.click(getByText('Approve & Continue'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/auth/consent/approve', expect.any(Object));
    });
  });

  it('shows error on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { getByText } = render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );

    fireEvent.click(getByText('Approve & Continue'));

    await waitFor(() => {
      expect(getByText(/Failed to approve consent/)).toBeDefined();
    });
  });
});
