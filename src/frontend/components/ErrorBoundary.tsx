import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorRecovery } from './ErrorRecovery';
import './dialogs.css';
import { buildAppPath } from '../lib/app-paths';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorId: crypto.randomUUID().slice(0, 8),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorId: undefined });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    globalThis.location.href = buildAppPath('/');
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const stackTrace =
        this.state.error?.stack ?? this.state.error?.message;

      return (
        <div className="app-boundary">
          <div className="app-boundary__inner">
            <ErrorRecovery
              title="Something went wrong"
              errorMessage="An unexpected error occurred. You can try reloading the page or going back."
              errorDetails={stackTrace}
              errorId={this.state.errorId}
              onRetry={this.handleRetry}
              onGoHome={this.handleGoHome}
              onRefresh={this.handleReload}
              refreshButtonLabel="Reload Application"
              isRefreshPrimary
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
