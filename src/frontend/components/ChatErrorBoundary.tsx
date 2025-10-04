import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/button';

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
    
    // Report to error tracking service (Sentry, LogRocket, etc.)
    // Example: reportError(error, { context: 'chat', chatId: this.props.chatId });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="text-center space-y-4 max-w-lg">
            <div className="text-orange-400 text-3xl mb-4">🔧</div>
            <h2 className="text-lg font-bold text-orange-100">Chat Error</h2>
            <p className="text-neutral-400 text-sm">
              There was a problem with this chat session. This might be due to a network issue 
              or a problem with the message processing.
            </p>
            
            {this.state.error && (
              <div className="mt-4 p-3 bg-orange-950/30 rounded border border-orange-800/30 text-left">
                <p className="text-orange-300 text-sm font-medium mb-2">Error:</p>
                <p className="text-orange-200 text-xs">
                  {this.state.error.message}
                </p>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center">
              <Button
                onClick={this.handleRetry}
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                Try Again
              </Button>
              <Button
                onClick={this.handleGoHome}
                variant="outline"
                size="sm"
                className="border-neutral-600 text-neutral-300 hover:bg-neutral-800"
              >
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
