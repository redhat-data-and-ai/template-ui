import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
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
    expect(getByText('Acknowledge & Proceed')).toBeDefined();
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

    fireEvent.click(getByText('Acknowledge & Proceed'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/auth/consent/approve', expect.any(Object));
    });
  });

  it('shows error on API failure after retries', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { getByText } = render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );

    fireEvent.click(getByText('Acknowledge & Proceed'));

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });

    expect(getByText(/Failed to approve consent/)).toBeDefined();

    vi.useRealTimers();
  });
});
