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
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 bg-card rounded-lg border border-destructive/20">
          <div className="text-center space-y-4 max-w-md">
            <div className="text-destructive text-4xl mb-4">&#x26A0;&#xFE0F;</div>
            <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
            <p className="text-muted-foreground text-sm">
              An unexpected error occurred. You can try reloading the page or going back.
            </p>
            
            {this.state.error && (
              <details className="mt-4 p-3 bg-destructive/10 rounded border border-destructive/20 text-left">
                <summary className="text-destructive text-sm cursor-pointer hover:text-destructive/80">
                  Error Details
                </summary>
                <pre className="mt-2 text-xs text-foreground whitespace-pre-wrap overflow-auto max-h-32">
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
              >
                Try Again
              </Button>
              <Button
                onClick={this.handleReload}
                variant="destructive"
                size="sm"
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
