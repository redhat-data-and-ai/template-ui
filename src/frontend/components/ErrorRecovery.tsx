import { useState } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  ExpandableSection,
} from '@patternfly/react-core';
import { ExclamationCircleIcon, ExclamationTriangleIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';

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
  /** Shown on the reload/refresh action. Defaults to the translated
      "Refresh Page". */
  refreshButtonLabel?: string;
  /** When true, the refresh/reload button uses the primary variant. */
  isRefreshPrimary?: boolean;
  /** Visual status for the empty state and alerts. Defaults to "danger". */
  status?: 'danger' | 'warning' | 'success' | 'info';
}

export function ErrorRecovery({
  // `title` and `refreshButtonLabel` cannot default in the signature:
  // a default there is evaluated before any hook runs, so it would
  // pin English no matter the language. Resolved below instead.
  title,
  errorMessage,
  errorDetails,
  errorId,
  onRetry,
  onGoHome,
  onRefresh,
  retryCount,
  maxRetries,
  isRetrying = false,
  refreshButtonLabel,
  isRefreshPrimary = false,
  status = 'danger',
}: ErrorRecoveryProps) {
  const { t } = useTranslation();
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const maxRetriesReached =
    maxRetries != null &&
    retryCount != null &&
    retryCount >= maxRetries;

  const showRetryCounter =
    maxRetries != null && retryCount != null && maxRetries > 0;

  const retryLabel = showRetryCounter
    ? t('errors.retryAttempt', { count: retryCount, max: maxRetries })
    : t('chat.retry');

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
      titleText={title ?? t('errors.title')}
      headingLevel="h2"
    >
      <EmptyStateBody>
        <Alert
          variant={status === 'warning' ? 'warning' : 'danger'}
          title={t('common.error')}
          isInline
          role="alert"
          className="pf-v6-u-mb-md"
        >
          {errorMessage}
        </Alert>

        {maxRetriesReached && (
          <Alert variant="info" isInline title={t('errors.maxRetries')} role="alert" className="pf-v6-u-mb-md" />
        )}

        {showTechnicalDetails && (
          <ExpandableSection
            toggleText={t('errors.technicalDetails')}
            isExpanded={detailsExpanded}
            onToggle={(_e, expanded) => setDetailsExpanded(expanded)}
            className="pf-v6-u-mb-md"
            isIndented
          >
            <div className="text-left font-mono text-sm py-2">
              {errorId != null && errorId !== '' && (
                <p className="mb-2">
                  <strong>{t('errors.errorId')}:</strong> {errorId}
                </p>
              )}
              {errorMessage !== '' && (
                <p className="mb-2">
                  <strong>{t('errors.message')}:</strong> {errorMessage}
                </p>
              )}
              {errorDetails != null && errorDetails !== '' && (
                <pre className="m-0 text-xs whitespace-pre-wrap overflow-auto max-h-32 p-2 rounded bg-black/10">
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
            {t('errors.startOver')}
          </Button>
        )}
        {onRetry !== undefined && (
          <Button
            variant={retryVariant}
            onClick={onRetry}
            isDisabled={maxRetriesReached || isRetrying}
            isLoading={isRetrying}
            spinnerAriaValueText={t('errors.retrying')}
            aria-label={t('chat.retryOperation')}
          >
            {retryLabel}
          </Button>
        )}
        <Button
          variant={refreshVariant}
          onClick={handleRefresh}
          isDisabled={isRetrying}
        >
          {refreshButtonLabel ?? t('errors.refreshPage')}
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
}
