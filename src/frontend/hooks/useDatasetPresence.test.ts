import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDatasetPresence } from './useDatasetPresence';

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('useDatasetPresence', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ dataset: { cases: [] } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false on mount when the dataset has no cases', async () => {
    const { result } = renderHook(() => useDatasetPresence());
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalled();
    });
    expect(result.current.hasCases).toBe(false);
  });

  it('is true when the dataset has at least one case', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ dataset: { cases: [{ id: 'c1' }] } })),
    );
    const { result } = renderHook(() => useDatasetPresence());
    await waitFor(() => {
      expect(result.current.hasCases).toBe(true);
    });
  });

  it('is false when the dataset endpoint returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ detail: 'no dataset found' }, 404)));
    const { result } = renderHook(() => useDatasetPresence());
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalled();
    });
    expect(result.current.hasCases).toBe(false);
  });

  it('refetches when the window is focused', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ dataset: { cases: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useDatasetPresence());
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fetchMock.mockImplementation(() => jsonResponse({ dataset: { cases: [{ id: 'c1' }] } }));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
