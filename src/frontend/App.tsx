import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { ChatRoutePage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastNotifications } from './components/ToastNotifications';
import { useThemeSync } from './hooks/useThemeSync';

export default function App() {
  useThemeSync();

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Top-level application error:', error, errorInfo);
      }}
    >
      <AppLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat/:threadId" element={<ChatRoutePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppLayout>
      <ToastNotifications />
    </ErrorBoundary>
  );
}
