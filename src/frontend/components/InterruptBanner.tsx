import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertActionCloseButton,
  Button,
  TextInput,
} from '@patternfly/react-core';
import { CheckCircleIcon, LinkIcon, RobotIcon, TimesCircleIcon } from '@patternfly/react-icons';
import {
  openMcpOAuthPopup,
  startMcpOAuthConnect,
  verifyMcpOAuthConnected,
} from '../services/mcp-oauth-api';
import type { InterruptInfo } from '../types/deep-agent';
import './tool-approval.css';

interface InterruptBannerProps {
  readonly interrupt: InterruptInfo;
  readonly isSubmitting?: boolean;
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

export function InterruptBanner({ interrupt, onResume, onDismiss, isSubmitting = false }: InterruptBannerProps) {
  const [response, setResponse] = useState('');
  const [oauthReady, setOauthReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [oauthOrigin, setOauthOrigin] = useState<string | null>(null);

  const mcpAuth = parseMcpAuthPayload(interrupt);

  const verifyAndSetReady = useCallback(async (mcpName: string) => {
    const connected = await verifyMcpOAuthConnected(mcpName);
    if (connected) {
      setOauthReady(true);
      setConnectError(null);
    }
  }, []);

  useEffect(() => {
    if (!mcpAuth) return undefined;

    const handler = (event: MessageEvent) => {
      const allowedOrigins = [window.location.origin, oauthOrigin].filter(Boolean);
      if (allowedOrigins.length > 0 && !allowedOrigins.includes(event.origin)) return;
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
  }, [mcpAuth, oauthReady, oauthOrigin, verifyAndSetReady]);

  const handleConnect = useCallback(async () => {
    if (!mcpAuth) return;
    setOauthOrigin(null);
    setConnecting(true);
    setConnectError(null);
    try {
      const { authorize_url } = await startMcpOAuthConnect(mcpAuth.mcp_name);
      const { origin } = openMcpOAuthPopup(authorize_url);
      setOauthOrigin(origin);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnecting(false);
    }
  }, [mcpAuth]);

  if (mcpAuth) {
    return (
      <div className="app-interrupt-auth">
        <div className="app-interrupt-auth__row">
          <div className="app-interrupt-auth__avatar">
            <RobotIcon aria-hidden="true" />
          </div>
          <div className="app-interrupt-auth__body">
            <div className="app-interrupt-auth__text">
              <p>
                To access external tools, you need to authenticate first.
                Click the button below to securely connect your account.
              </p>
            </div>
            {connectError && (
              <p className="app-interrupt-auth__error">{connectError}</p>
            )}
            <div className="app-interrupt-auth__actions">
              {!oauthReady ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<LinkIcon />}
                  isLoading={connecting}
                  onClick={() => void handleConnect()}
                >
                  Authenticate
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CheckCircleIcon />}
                  isDisabled={isSubmitting}
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

  if (approval) {
    return (
      <div className="app-interrupt" role="alert">
        <Alert
          variant="warning"
          title="Action Required"
          isInline
          actionClose={<AlertActionCloseButton onClose={onDismiss} />}
        >
          <p className="app-interrupt__text">{valueStr}</p>
          <div className="app-interrupt__actions">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon />}
              isDisabled={isSubmitting}
              onClick={() => onResume('approved')}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<TimesCircleIcon />}
              isDisabled={isSubmitting}
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
    <div className="app-interrupt" role="alert">
      <Alert
        title="Input Required"
        isInline
        actionClose={<AlertActionCloseButton onClose={onDismiss} />}
      >
        <p className="app-interrupt__text">{valueStr}</p>
        <div className="app-interrupt__actions">
          <TextInput
            value={response}
            onChange={(_e, val) => setResponse(val)}
            onKeyDown={(e) => {
              if (!isSubmitting && e.key === 'Enter' && response.trim()) onResume(response.trim());
            }}
            placeholder="Type your response..."
            aria-label="Interrupt response"
            className="app-interrupt__input"
          />
          <Button
            variant="primary"
            size="sm"
            isDisabled={isSubmitting || !response.trim()}
            onClick={() => onResume(response.trim())}
          >
            Send
          </Button>
        </div>
      </Alert>
    </div>
  );
}
