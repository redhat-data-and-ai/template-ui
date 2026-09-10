import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface ConsentStatus {
  hasConsent: boolean;
  grantedAt: string | null;
}

export function AuthorizationSettings() {
  const navigate = useNavigate();
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConsentStatus = useCallback(async () => {
    try {
      const response = await fetch('/auth/consent/status', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setConsentStatus(data);
      }
    } catch {
      setError('Failed to load authorization status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsentStatus();
  }, [fetchConsentStatus]);

  const handleRevoke = async () => {
    setIsRevoking(true);
    setError(null);

    try {
      const response = await fetch('/auth/consent/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error('Failed to revoke authorization');
      }

      navigate('/consent', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsRevoking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-label="Loading authorization status">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status indicator */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary border border-border">
        {consentStatus?.hasConsent ? (
          <CheckCircle className="w-6 h-6 text-green-500 dark:text-green-400 shrink-0" />
        ) : (
          <XCircle className="w-6 h-6 text-destructive shrink-0" />
        )}
        <div>
          <p className="font-medium text-foreground">
            {consentStatus?.hasConsent ? 'Authorization Granted' : 'Not Authorized'}
          </p>
          <p className="text-sm text-muted-foreground">
            {consentStatus?.hasConsent
              ? 'You have authorized this agent to act on your behalf'
              : 'This agent does not have your authorization'}
          </p>
        </div>
      </div>

      {consentStatus?.hasConsent && (
        <>
          {/* Consent details */}
          {consentStatus.grantedAt && (
            <div className="text-sm">
              <span className="text-muted-foreground">Authorized on: </span>
              <span className="text-foreground font-medium">
                {new Date(consentStatus.grantedAt).toLocaleString()}
              </span>
            </div>
          )}

          {/* What was granted */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Granted Permissions
            </h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0" />
                Authenticate with connected platforms using your SSO session
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0" />
                Execute actions on your behalf through MCP tools and skills
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0" />
                Read and process data from connected platforms
              </li>
            </ul>
          </div>

          {/* Revoke section */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-medium text-foreground mb-1">Revoke Authorization</h4>
                <p className="text-sm text-muted-foreground">
                  Revoking will remove the agent's ability to act on your behalf.
                  You will need to re-authorize to continue using the application.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={isRevoking}
              className="px-4 py-2 rounded-lg bg-destructive text-white hover:bg-destructive/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
            >
              {isRevoking ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Revoking…
                </>
              ) : (
                'Revoke Authorization'
              )}
            </button>
          </div>
        </>
      )}

      {!consentStatus?.hasConsent && (
        <div className="text-center py-4">
          <p className="text-muted-foreground mb-4 text-sm">
            To use this agent, you need to grant authorization.
          </p>
          <button
            type="button"
            onClick={() => navigate('/consent', { replace: true })}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Grant Authorization
          </button>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3" role="alert">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
