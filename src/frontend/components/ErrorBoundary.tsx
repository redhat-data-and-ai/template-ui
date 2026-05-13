import { Component, ErrorInfo, ReactNode } from 'react';
import {
  Alert,
  Button,
  ExpandableSection,
} from '@patternfly/react-core';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8">
          <div className="max-w-md w-full space-y-4">
            <Alert
              variant="danger"
              title="Something went wrong"
              isInline
            >
              <p className="text-sm mt-1">
                An unexpected error occurred. You can try reloading the page or going back.
              </p>
              {this.state.error && (
                <ExpandableSection toggleText="Error Details" className="mt-3">
                  <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-32 p-2 rounded bg-black/20">
                    {this.state.error.message}
                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                  </pre>
                </ExpandableSection>
              )}
            </Alert>
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={this.handleRetry}>
                Try Again
              </Button>
              <Button variant="danger" size="sm" onClick={this.handleReload}>
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
