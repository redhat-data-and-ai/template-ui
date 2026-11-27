import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConsentPage } from './ConsentPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('ConsentPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders authorization page', () => {
    render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Authorization Required' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Acknowledge & Proceed' })).toBeDefined();
    expect(screen.getByText('AI Technology Usage Notice')).toBeDefined();
  });

  it('exposes a single main landmark', () => {
    render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('calls API on approve', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ redirectUrl: '/' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge & Proceed' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/auth/consent/approve', expect.any(Object));
    });
  });

  it('shows error on API failure after retries', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', mockFetch);

    render(
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge & Proceed' }));

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });

    expect(screen.getByRole('alert').textContent).toMatch(/Failed to approve consent/);
    expect(screen.getByRole('button', { name: 'Acknowledge & Proceed' })).toBeEnabled();
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
