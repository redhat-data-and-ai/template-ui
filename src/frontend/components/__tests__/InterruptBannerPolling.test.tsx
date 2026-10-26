/**
 * The banner must notice a connection it was not told about.
 *
 * It had two signals: a `postMessage` from the OAuth callback, sent
 * to `UI_ORIGIN`, and a window `focus`. The message is dropped
 * whenever the reader's origin differs from that setting — a
 * port-forward on :8080 against an ingress on :8081 is the ordinary
 * local setup — and connecting from Settings in the same tab fires
 * neither. The integration connected and the banner kept asking.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/mcp-oauth-api', () => ({
  openMcpOAuthPopup: vi.fn(),
  startMcpOAuthConnect: vi.fn(),
  verifyMcpOAuthConnected: vi.fn(),
}));

import { verifyMcpOAuthConnected } from '../../services/mcp-oauth-api';
import { InterruptBanner } from '../InterruptBanner';

const INTERRUPT = {
  value: JSON.stringify({ type: 'mcp_auth_required', mcp_name: 'atlan' }),
  resumable: true,
  payload: {
    type: 'mcp_auth_required',
    mcp_name: 'atlan',
    reason: 'not_connected',
  },
} as never;

describe('InterruptBanner polls for a connection', () => {
  beforeEach(() => {
    vi.mocked(verifyMcpOAuthConnected).mockReset();
  });

  it('resumes once the integration reports connected', async () => {
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);
    const onResume = vi.fn();

    render(<InterruptBanner interrupt={INTERRUPT} onResume={onResume} />);

    await waitFor(() => expect(onResume).toHaveBeenCalledWith('continue'), {
      timeout: 6000,
    });
  });

  it('resumes exactly once even though the poll keeps running', async () => {
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);
    const onResume = vi.fn();

    render(<InterruptBanner interrupt={INTERRUPT} onResume={onResume} />);

    await waitFor(() => expect(onResume).toHaveBeenCalled(), { timeout: 6000 });
    await new Promise((r) => setTimeout(r, 2500));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('keeps asking while it is still not connected', async () => {
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(false);
    const onResume = vi.fn();

    render(<InterruptBanner interrupt={INTERRUPT} onResume={onResume} />);

    await new Promise((r) => setTimeout(r, 2500));
    expect(onResume).not.toHaveBeenCalled();
    expect(screen.getByTestId('mcp-connect-atlan')).toBeTruthy();
  });
});
