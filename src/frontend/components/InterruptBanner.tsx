import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertActionCloseButton,
  Button,
  TextInput,
} from '@patternfly/react-core';
import { Bot, CheckCircle, Link2, XCircle } from 'lucide-react';
import {
  openMcpOAuthPopup,
  startMcpOAuthConnect,
  verifyMcpOAuthConnected,
} from '../services/mcp-oauth-api';
import type { InterruptInfo } from '../types/deep-agent';

interface InterruptBannerProps {
  readonly interrupt: InterruptInfo;
  readonly onResume: (response: string) => void;
  readonly onDismiss: () => void;
}

/** Severity the agent attached to this approval, if any. */
type ApprovalRisk = 'high' | 'low' | 'normal';

/**
 * Read the risk marker the agent prefixes onto an interrupt description.
 *
 * Without it every approval renders identically, so deleting a user
 * looks the same as reading a file and people learn to approve without
 * reading. Falls back to `normal` for interrupts that carry no marker.
 */
function approvalRisk(value: string): ApprovalRisk {
  if (value.includes('[HIGH RISK]')) return 'high';
  if (value.includes('[low risk]')) return 'low';
  return 'normal';
}

/** The marker is for the UI, not the reader. */
function stripRiskMarker(value: string): string {
  return value.replace('[HIGH RISK]', '').replace('[low risk]', '').trimStart();
}

function isToolApproval(value: string): boolean {
  // A risk marker is only ever emitted for a tool-approval interrupt, so
  // it is a definitive signal. The keyword match below is the fallback
  // for interrupts that carry no marker — without the marker check, an
  // approval whose wording happens to avoid these words renders as a
  // generic prompt with no Approve/Reject buttons.
  if (approvalRisk(value) !== 'normal') return true;

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

export function InterruptBanner({ interrupt, onResume, onDismiss }: InterruptBannerProps) {
  const { t } = useTranslation();
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
      setConnectError(err instanceof Error ? err.message : t('interrupt.connectFailed'));
    } finally {
      setConnecting(false);
    }
  }, [mcpAuth, t]);

  if (mcpAuth) {
    return (
      <div className="w-full space-y-0 animate-fadeInUpSmooth">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="md-prose max-w-none text-foreground">
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
                  {t('interrupt.authenticate')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                  onClick={() => onResume('continue')}
                >
                  {t('common.continue')}
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
    const risk = approvalRisk(valueStr);
    return (
      <div className="mx-4 mb-3" role="alert">
        <Alert
          variant={risk === 'high' ? 'danger' : 'warning'}
          title={risk === 'high' ? 'High-risk action — review carefully' : 'Action Required'}
          isInline
          actionClose={<AlertActionCloseButton onClose={onDismiss} />}
        >
          <p className="text-sm mb-3 whitespace-pre-wrap">
            {stripRiskMarker(valueStr)}
          </p>
          <div className="flex items-center gap-2">
            {/* A destructive action should not have the affirmative
                button styled as the obvious default. */}
            <Button
              variant={risk === 'high' ? 'secondary' : 'primary'}
              size="sm"
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              onClick={() => onResume('approved')}
            >
              {t('chat.approve')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<XCircle className="w-3.5 h-3.5" />}
              onClick={() => onResume('rejected')}
            >
              {t('chat.reject')}
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3" role="alert">
      <Alert
        title={t('interrupt.title')}
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
            placeholder={t('interrupt.placeholder')}
            aria-label={t('interrupt.response')}
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
