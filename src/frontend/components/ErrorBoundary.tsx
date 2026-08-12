import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorRecovery } from './ErrorRecovery';
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
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8">
          <div className="max-w-md w-full">
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
