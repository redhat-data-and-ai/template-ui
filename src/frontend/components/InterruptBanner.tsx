import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertActionCloseButton,
  Button,
  TextInput,
} from '@patternfly/react-core';
import { Bot, CheckCircle, Link2, XCircle } from 'lucide-react';
import { buildAgentApiUrl } from '../lib/app-paths';
import type { InterruptInfo } from '../types/deep-agent';

interface ToolApprovalInfo {
  agentName: string;
  toolName: string;
}

function parseToolApproval(value: string): ToolApprovalInfo | null {
  const match = value.match(
    /subagent '([^']+)' wants to call '([^']+)'/
  );
  if (!match) return null;
  return { agentName: match[1], toolName: match[2] };
}

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

function interruptValueAsString(value: string | object): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function parseMcpAuthPayload(interrupt: InterruptInfo): InterruptInfo['payload'] | null {
  if (interrupt.payload?.type === 'mcp_auth_required') {
    return interrupt.payload;
  }
  const raw = interrupt.value;
  if (typeof raw === 'object' && raw !== null && (raw as { type?: string }).type === 'mcp_auth_required') {
    return raw as unknown as NonNullable<InterruptInfo['payload']>;
  }
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
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

const STATUS_RETRY_MS = 400;
const STATUS_MAX_RETRIES = 6;

async function verifyMcpConnected(mcpName: string): Promise<boolean> {
  for (let attempt = 0; attempt < STATUS_MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(
        buildAgentApiUrl(`/mcp/${encodeURIComponent(mcpName)}/status`),
        { credentials: 'include' },
      );
      if (resp.ok) {
        const body = (await resp.json()) as { connected?: boolean };
        if (body.connected) return true;
      }
    } catch {
      // retry
    }
    if (attempt < STATUS_MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, STATUS_RETRY_MS));
    }
  }
  return false;
}

export function InterruptBanner({ interrupt, onResume, onDismiss }: InterruptBannerProps) {
  const [response, setResponse] = useState('');
  const [oauthReady, setOauthReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const mcpAuth = parseMcpAuthPayload(interrupt);

  const verifyAndSetReady = useCallback(async (mcpName: string) => {
    const connected = await verifyMcpConnected(mcpName);
    if (connected) {
      setOauthReady(true);
      setConnectError(null);
    }
  }, []);

  useEffect(() => {
    if (!mcpAuth) return undefined;

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; mcp_name?: string } | null;
      if (data?.type === 'mcp_oauth_done' && data.mcp_name === mcpAuth.mcp_name) {
        void verifyAndSetReady(mcpAuth.mcp_name);
      }
    };

    const onFocus = () => {
      if (!oauthReady) {
        void verifyAndSetReady(mcpAuth.mcp_name);
      }
    };

    window.addEventListener('message', handler);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('message', handler);
      window.removeEventListener('focus', onFocus);
    };
  }, [mcpAuth, oauthReady, verifyAndSetReady]);

  const handleConnect = useCallback(async () => {
    if (!mcpAuth) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const connectUrl = buildAgentApiUrl(`/mcp/${encodeURIComponent(mcpAuth.mcp_name)}/connect`);
      const resp = await fetch(connectUrl, {
        method: 'POST',
        credentials: 'include',
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Connect failed (${resp.status})`);
      }
      const body = (await resp.json()) as { authorize_url?: string };
      if (!body.authorize_url) {
        throw new Error('No authorize_url returned');
      }
      const popup = window.open(body.authorize_url, 'mcp-oauth', 'width=600,height=700');
      if (!popup) {
        throw new Error('Popup blocked by browser');
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnecting(false);
    }
  }, [mcpAuth]);

  if (mcpAuth) {
    return (
      <div className="w-full space-y-0 animate-fadeInUpSmooth">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="prose prose-sm max-w-none text-foreground">
              <p>
                To access external tools, you need to authenticate first.
                Click the button below to securely connect your account.
              </p>
            </div>
            {connectError && (
              <p className="text-sm text-red-600 mt-2">{connectError}</p>
            )}
            <div className="mt-3">
              {!oauthReady ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Link2 className="w-3.5 h-3.5" />}
                  isLoading={connecting}
                  onClick={() => void handleConnect()}
                >
                  Authenticate
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
          </div>
        </div>
      </div>
    );
  }

  const valueStr = interruptValueAsString(interrupt.value);
  const approval = isToolApproval(valueStr);

  const toolApproval = parseToolApproval(valueStr);

  if (approval) {
    return (
      <div className="mx-4 mb-3" role="alert">
        <Alert
          variant="warning"
          title={toolApproval ? 'Tool Approval Required' : 'Action Required'}
          isInline
          actionClose={<AlertActionCloseButton onClose={onDismiss} />}
        >
          <div className="space-y-2 mt-2">
            {toolApproval ? (
              <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground font-medium">Subagent:</span>
                  <code className="text-xs font-mono font-semibold bg-muted/40 px-1.5 py-0.5 rounded">
                    {toolApproval.agentName}
                  </code>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground font-medium">Tool:</span>
                  <code className="text-xs font-mono font-semibold text-warning-foreground bg-warning/10 px-1.5 py-0.5 rounded">
                    {toolApproval.toolName}
                  </code>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{valueStr}</p>
            )}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
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
        <p className="text-sm mb-3 whitespace-pre-wrap">{valueStr}</p>
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
