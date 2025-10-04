import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/button';

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
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 bg-neutral-900 rounded-lg border border-red-500/20">
          <div className="text-center space-y-4 max-w-md">
            <div className="text-red-400 text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-100">Something went wrong</h2>
            <p className="text-neutral-400 text-sm">
              An unexpected error occurred. You can try reloading the page or going back.
            </p>
            
            {this.state.error && (
              <details className="mt-4 p-3 bg-red-950/50 rounded border border-red-800/50 text-left">
                <summary className="text-red-300 text-sm cursor-pointer hover:text-red-200">
                  Error Details
                </summary>
                <pre className="mt-2 text-xs text-red-200 whitespace-pre-wrap overflow-auto max-h-32">
                  {this.state.error.message}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            )}
            
            <div className="flex gap-3 mt-6">
              <Button
                onClick={this.handleRetry}
                variant="outline"
                size="sm"
                className="border-red-600 text-red-100 hover:bg-red-900/50"
              >
                Try Again
              </Button>
              <Button
                onClick={this.handleReload}
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
              >
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
