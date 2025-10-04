
import { Routes, Route } from 'react-router-dom';
import { ChatProvider } from './contexts/ChatContext';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { ChatRoutePage } from './pages/ChatPage';
import { ErrorBoundary } from './components/ErrorBoundary';

// Main App component - clean and simple!
export default function App() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Top-level application error:', error, errorInfo);
        // Here you could report to error tracking service
      }}
    >
      <ChatProvider>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat/:threadId" element={<ChatRoutePage />} />
          </Routes>
        </AppLayout>
      </ChatProvider>
    </ErrorBoundary>
  );
}