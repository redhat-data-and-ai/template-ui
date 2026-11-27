import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  List,
  ListItem,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { buildAppPath } from '../../lib/app-paths';

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
      const response = await fetch(buildAppPath('/auth/consent/status'), {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data = await response.json();
      setConsentStatus(data);
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
      const response = await fetch(buildAppPath('/auth/consent/revoke'), {
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
      <div className="app-settings__center" role="status" aria-label="Loading authorization status">
        <Spinner size="lg" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="app-settings__stack">
      <Alert
        component="h3"
        isInline
        variant={consentStatus?.hasConsent ? 'success' : 'danger'}
        title={consentStatus?.hasConsent ? 'Authorization Granted' : 'Not Authorized'}
      >
        {consentStatus?.hasConsent
          ? 'You have authorized this agent to act on your behalf'
          : 'This agent does not have your authorization'}
      </Alert>

      {consentStatus?.hasConsent && (
        <>
          {consentStatus.grantedAt && (
            <p>
              <span className="app-settings__muted">Authorized on: </span>
              <strong>{new Date(consentStatus.grantedAt).toLocaleString()}</strong>
            </p>
          )}

          <div>
            <Title headingLevel="h3" size="md" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }}>
              Granted Permissions
            </Title>
            <List isPlain>
              <ListItem>Authenticate with connected platforms using your SSO session</ListItem>
              <ListItem>Execute actions on your behalf through MCP tools and skills</ListItem>
              <ListItem>Read and process data from connected platforms</ListItem>
            </List>
          </div>

          <Alert component="h3" isInline variant="warning" title="Revoke Authorization">
            <p style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>
              Revoking will remove the agent&apos;s ability to act on your behalf. You will need to
              re-authorize to continue using the application.
            </p>
            <Button variant="danger" onClick={handleRevoke} isDisabled={isRevoking} isLoading={isRevoking}>
              {isRevoking ? 'Revoking…' : 'Revoke Authorization'}
            </Button>
          </Alert>
        </>
      )}

      {!consentStatus?.hasConsent && (
        <div>
          <p className="app-settings__muted" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>
            To use this agent, you need to grant authorization.
          </p>
          <Button variant="primary" onClick={() => navigate('/consent', { replace: true })}>
            Grant Authorization
          </Button>
        </div>
      )}

      {error && <Alert component="h3" isInline isLiveRegion variant="danger" title={error} role="alert" />}
    </div>
  );
}
