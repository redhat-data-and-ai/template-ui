import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorRecovery } from './ErrorRecovery';
import { buildAppPath } from '../lib/app-paths';

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
    globalThis.location.href = buildAppPath('/');
  };

  private handleRefreshChat = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="max-w-lg w-full">
            <ErrorRecovery
              title="Chat Error"
              status="warning"
              errorMessage="There was a problem with this chat session. This might be due to a network issue or a problem with the message processing."
              errorDetails={this.state.error?.message}
              onRetry={this.handleRetry}
              onGoHome={this.handleGoHome}
              onRefresh={this.handleRefreshChat}
              refreshButtonLabel="Refresh Chat"
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
