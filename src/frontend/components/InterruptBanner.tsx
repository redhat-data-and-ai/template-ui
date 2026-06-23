import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertActionCloseButton,
  Button,
  TextInput,
} from '@patternfly/react-core';
import { CheckCircle, Link2, XCircle } from 'lucide-react';
import { buildAgentApiUrl } from '../lib/app-paths';
import type { InterruptInfo } from '../types/deep-agent';

interface InterruptBannerProps {
  readonly interrupt: InterruptInfo;
  readonly onResume: (response: string) => void;
  readonly onDismiss: () => void;
}

function isToolApproval(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('approve') || lower.includes('confirm') || lower.includes('permission')
    || lower.includes('allow') || lower.includes('proceed');
}

function parseMcpAuthPayload(interrupt: InterruptInfo): InterruptInfo['payload'] | null {
  if (interrupt.payload?.type === 'mcp_auth_required') {
    return interrupt.payload;
  }
  try {
    const parsed = JSON.parse(interrupt.value) as unknown;
    if (
      parsed
      && typeof parsed === 'object'
      && (parsed as { type?: string }).type === 'mcp_auth_required'
    ) {
      return parsed as InterruptInfo['payload'];
    }
  } catch {
    // not JSON — fall through
  }
  return null;
}

export function InterruptBanner({ interrupt, onResume, onDismiss }: InterruptBannerProps) {
  const [response, setResponse] = useState('');
  const [oauthReady, setOauthReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const mcpAuth = parseMcpAuthPayload(interrupt);

  useEffect(() => {
    if (!mcpAuth) return undefined;

    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; mcp_name?: string } | null;
      if (data?.type === 'mcp_oauth_done' && data.mcp_name === mcpAuth.mcp_name) {
        setOauthReady(true);
        setConnectError(null);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [mcpAuth]);

  const handleConnect = useCallback(async () => {
    if (!mcpAuth) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const connectUrl = buildAgentApiUrl(`/mcp/${encodeURIComponent(mcpAuth.mcp_name)}/connect`);
      const resp = await fetch(connectUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Connect failed (${resp.status})`);
      }
      const body = (await resp.json()) as { authorize_url?: string };
      if (!body.authorize_url) {
        throw new Error('No authorize_url returned');
      }
      window.open(body.authorize_url, 'mcp-oauth', 'width=600,height=700');
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnecting(false);
    }
  }, [mcpAuth]);

  if (mcpAuth) {
    return (
      <div className="mx-4 mb-3" role="alert">
        <Alert
          variant="warning"
          title="MCP Connection Required"
          isInline
          actionClose={<AlertActionCloseButton onClose={onDismiss} />}
        >
          <p className="text-sm mb-3 whitespace-pre-wrap">{mcpAuth.message}</p>
          {connectError && (
            <p className="text-sm text-red-600 mb-2">{connectError}</p>
          )}
          <div className="flex items-center gap-2">
            {!oauthReady ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Link2 className="w-3.5 h-3.5" />}
                isLoading={connecting}
                onClick={() => void handleConnect()}
              >
                Connect
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon={<CheckCircle className="w-3.5 h-3.5" />}
                onClick={() => onResume('continue')}
              >
                Continue
              </Button>
            )}
          </div>
        </Alert>
      </div>
    );
  }

  const approval = isToolApproval(interrupt.value);

  if (approval) {
    return (
      <div className="mx-4 mb-3" role="alert">
        <Alert
          variant="warning"
          title="Action Required"
          isInline
          actionClose={<AlertActionCloseButton onClose={onDismiss} />}
        >
          <p className="text-sm mb-3 whitespace-pre-wrap">{interrupt.value}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              onClick={() => onResume('approved')}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<XCircle className="w-3.5 h-3.5" />}
              onClick={() => onResume('rejected')}
            >
              Reject
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3" role="alert">
      <Alert
        title="Input Required"
        isInline
        actionClose={<AlertActionCloseButton onClose={onDismiss} />}
      >
        <p className="text-sm mb-3 whitespace-pre-wrap">{interrupt.value}</p>
        <div className="flex items-center gap-2">
          <TextInput
            value={response}
            onChange={(_e, val) => setResponse(val)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && response.trim()) onResume(response.trim());
            }}
            placeholder="Type your response..."
            aria-label="Interrupt response"
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            isDisabled={!response.trim()}
            onClick={() => onResume(response.trim())}
          >
            Send
          </Button>
        </div>
      </Alert>
    </div>
  );
}
