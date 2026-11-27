import { useState } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  ExpandableSection,
} from '@patternfly/react-core';
import './rich-content.css';
import { ExclamationCircleIcon, ExclamationTriangleIcon } from '@patternfly/react-icons';

export interface ErrorRecoveryProps {
  title?: string;
  errorMessage: string;
  errorDetails?: string;
  errorId?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
  onRefresh?: () => void;
  retryCount?: number;
  maxRetries?: number;
  isRetrying?: boolean;
  /** Shown on the reload/refresh action. Defaults to "Refresh Page". */
  refreshButtonLabel?: string;
  /** When true, the refresh/reload button uses the primary variant. */
  isRefreshPrimary?: boolean;
  /** Visual status for the empty state and alerts. Defaults to "danger". */
  status?: 'danger' | 'warning' | 'success' | 'info';
}

export function ErrorRecovery({
  title = 'Something went wrong',
  errorMessage,
  errorDetails,
  errorId,
  onRetry,
  onGoHome,
  onRefresh,
  retryCount,
  maxRetries,
  isRetrying = false,
  refreshButtonLabel = 'Refresh Page',
  isRefreshPrimary = false,
  status = 'danger',
}: ErrorRecoveryProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const maxRetriesReached =
    maxRetries != null &&
    retryCount != null &&
    retryCount >= maxRetries;

  const showRetryCounter =
    maxRetries != null && retryCount != null && maxRetries > 0;

  const retryLabel = showRetryCounter
    ? `Retry (attempt ${retryCount}/${maxRetries})`
    : 'Retry';

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      window.location.reload();
    }
  };

  const retryVariant = isRefreshPrimary ? 'secondary' : 'primary';
  const refreshVariant = isRefreshPrimary ? 'primary' : 'secondary';

  const showTechnicalDetails = Boolean(errorMessage || errorId || errorDetails);

  const stateIcon =
    status === 'warning' ? ExclamationTriangleIcon : ExclamationCircleIcon;

  return (
    <EmptyState
      status={status}
      icon={stateIcon}
      titleText={title}
      headingLevel="h2"
    >
      <EmptyStateBody>
        <Alert
          variant={status === 'warning' ? 'warning' : 'danger'}
          title="Error"
          isInline
          role="alert"
          className="pf-v6-u-mb-md"
        >
          {errorMessage}
        </Alert>

        {maxRetriesReached && (
          <Alert variant="info" isInline title="Maximum retries reached" role="alert" className="pf-v6-u-mb-md" />
        )}

        {showTechnicalDetails && (
          <ExpandableSection
            toggleText="Technical details"
            isExpanded={detailsExpanded}
            onToggle={(_e, expanded) => setDetailsExpanded(expanded)}
            className="pf-v6-u-mb-md"
            isIndented
          >
            <div className="app-error-details">
              {errorId != null && errorId !== '' && (
                <p>
                  <strong>Error ID:</strong> {errorId}
                </p>
              )}
              {errorMessage !== '' && (
                <p>
                  <strong>Message:</strong> {errorMessage}
                </p>
              )}
              {errorDetails != null && errorDetails !== '' && (
                <pre>
                  {errorDetails}
                </pre>
              )}
            </div>
          </ExpandableSection>
        )}
      </EmptyStateBody>

      <EmptyStateActions>
        {onGoHome !== undefined && (
          <Button variant="secondary" onClick={onGoHome} isDisabled={isRetrying}>
            Start Over
          </Button>
        )}
        {onRetry !== undefined && (
          <Button
            variant={retryVariant}
            onClick={onRetry}
            isDisabled={maxRetriesReached || isRetrying}
            isLoading={isRetrying}
            spinnerAriaValueText="Retrying"
            aria-label="Retry operation"
          >
            {retryLabel}
          </Button>
        )}
        <Button
          variant={refreshVariant}
          onClick={handleRefresh}
          isDisabled={isRetrying}
        >
          {refreshButtonLabel}
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
}
