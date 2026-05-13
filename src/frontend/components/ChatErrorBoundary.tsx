import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button } from '@patternfly/react-core';

interface Props {
  children: ReactNode;
  onRetry?: () => void;
  chatId?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ChatErrorBoundary caught an error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="max-w-lg w-full space-y-4">
            <Alert variant="warning" title="Chat Error" isInline>
              <p className="text-sm mt-1">
                There was a problem with this chat session. This might be due to a network issue
                or a problem with the message processing.
              </p>
              {this.state.error && (
                <div className="mt-3 p-2 rounded bg-black/20 text-left">
                  <p className="text-xs">{this.state.error.message}</p>
                </div>
              )}
            </Alert>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="warning" size="sm" onClick={this.handleRetry}>
                Try Again
              </Button>
              <Button variant="secondary" size="sm" onClick={this.handleGoHome}>
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
