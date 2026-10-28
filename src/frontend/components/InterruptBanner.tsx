import { useCallback, useEffect, useState } from 'react';
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
  /** Fill a subagent card instead of lining up under a main reply. */
  readonly embedded?: boolean;
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

interface UserQuestion {
  question: string;
  options: string[];
}

function parseUserQuestion(interrupt: InterruptInfo): UserQuestion | null {
  const record = readQuestionRecord(interrupt.value);
  if (!record) return null;
  const question = typeof record.question === 'string' ? record.question.trim() : '';
  if (!question) return null;
  const options = Array.isArray(record.options)
    ? record.options
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    : [];
  return { question, options };
}

function readQuestionRecord(raw: unknown): { question?: unknown; options?: unknown } | null {
  if (typeof raw === 'string') {
    try {
      return readQuestionRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if ((raw as { type?: unknown }).type !== 'user_question') return null;
  return raw as { question?: unknown; options?: unknown };
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

export function InterruptBanner({ interrupt, onResume, onDismiss, embedded = false }: InterruptBannerProps) {
  const [response, setResponse] = useState('');
  const [oauthReady, setOauthReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [oauthOrigin, setOauthOrigin] = useState<string | null>(null);

  const mcpAuth = parseMcpAuthPayload(interrupt);
  const userQuestion = parseUserQuestion(interrupt);

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

  if (userQuestion) {
    const fields = (
      <>
          <p className="text-sm mb-3 whitespace-pre-wrap">{userQuestion.question}</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            {userQuestion.options.map((option, index) => (
              <span key={`${index}-${option}`} className="pf-v6-c-form-control col-start-1 hover:brightness-110">
                <button
                  type="button"
                  onClick={() => onResume(option)}
                  className="col-span-full row-start-1 w-full cursor-pointer appearance-none border-0 bg-transparent text-left text-[var(--pf-v6-c-form-control--Color)]"
                  style={{
                    paddingBlockStart: 'var(--pf-v6-c-form-control__input--PaddingBlockStart)',
                    paddingBlockEnd: 'var(--pf-v6-c-form-control__input--PaddingBlockEnd)',
                    paddingInlineStart: 'var(--pf-v6-c-form-control__input--PaddingInlineStart)',
                    paddingInlineEnd: 'var(--pf-v6-c-form-control__input--PaddingInlineEnd)',
                    fontSize: 'var(--pf-v6-c-form-control--FontSize)',
                    lineHeight: 'var(--pf-v6-c-form-control--LineHeight)',
                  }}
                >
                  {option}
                </button>
              </span>
            ))}
            <TextInput
              value={response}
              onChange={(_e, val) => setResponse(val)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && response.trim()) onResume(response.trim());
              }}
              placeholder={userQuestion.options.length > 0 ? 'Or type your own answer...' : 'Type your answer...'}
              aria-label="Your answer"
              className="col-start-1"
            />
            <div
              className="col-start-2 flex items-center gap-2"
              style={{ gridRow: userQuestion.options.length + 1 }}
            >
              <Button
                variant="primary"
                size="sm"
                isDisabled={!response.trim()}
                onClick={() => onResume(response.trim())}
              >
                Send
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onResume('The user skipped this question.')}
              >
                Skip
              </Button>
            </div>
          </div>
      </>
    );
    if (embedded) {
      return (
        <div role="region" aria-label="Question from the agent">
          {fields}
        </div>
      );
    }
    return (
      <div className="mb-3 flex items-start gap-3" role="region" aria-label="Question from the agent">
        <div className="w-8 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 max-w-[85%] sm:max-w-[80%]">
          {fields}
        </div>
      </div>
    );
  }

  const valueStr = interruptValueAsString(interrupt.value);
  const approval = isToolApproval(valueStr);

  if (approval) {
    return (
      <div className="mx-4 mb-3" role="alert">
        <Alert
          variant="warning"
          title="Action Required"
          isInline
          actionClose={<AlertActionCloseButton onClose={onDismiss} />}
        >
          <p className="text-sm mb-3 whitespace-pre-wrap">{valueStr}</p>
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
