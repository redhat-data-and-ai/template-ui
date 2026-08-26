import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { ChatRoutePage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProjectChatPage } from './pages/ProjectChatPage';
import { EvalDatasetPage } from './pages/EvalDatasetPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastNotifications } from './components/ToastNotifications';
import { useThemeSync } from './hooks/useThemeSync';
import { loadConfig, setBranding, setFeatures } from './redux/slices/config';
import { setConfigDefaults } from './redux/slices/userSettings';
import type { RootState, AppDispatch } from './redux/store';

export default function App() {
  const dispatch = useDispatch<AppDispatch>();
  const { branding, loading, error } = useSelector((state: RootState) => state.config);
  const theme = useSelector((state: RootState) => state.userSettings.theme);

  useThemeSync();

  // Load config at app init
  useEffect(() => {
    // Seed branding/features from server-injected HTML data
    const serverBranding = window.APP_DATA?.branding;
    const serverFeatures = window.APP_DATA?.features;
    if (serverBranding) {
      dispatch(setBranding(serverBranding));
    }
    if (serverFeatures) {
      dispatch(setFeatures(serverFeatures));
      dispatch(setConfigDefaults({ debug_mode_default: serverFeatures.debug_mode_default }));
    }

    dispatch(loadConfig()).then((result: any) => {
      if (result.meta.requestStatus === 'fulfilled' && result.payload?.features) {
        dispatch(setConfigDefaults({
          debug_mode_default: result.payload.features.debug_mode_default,
        }));
      }
    });
  }, [dispatch]);

  // Apply branding to DOM when config loads
  useEffect(() => {
    if (!branding) return;

    // Apply colors based on current theme
    const colors = theme === 'dark' ? branding.colors?.dark : branding.colors?.light;
    if (!colors) return;

    document.documentElement.style.setProperty('--primary', colors.primary);
    document.documentElement.style.setProperty('--accent', colors.accent);
    document.documentElement.style.setProperty('--background', colors.background);
    document.documentElement.style.setProperty('--foreground', colors.foreground);

    // Update document title
    if (branding.title) {
      document.title = branding.title;
    }

    // Update favicon - use favicon_url if provided, otherwise fall back to logo_url
    const faviconUrl = branding.favicon_url || branding.logo_url;
    if (faviconUrl) {
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (link) {
        link.href = faviconUrl;
      }
    }
  }, [branding, theme]);

  // Don't block render on config failure - fall back to defaults
  // Only show loading on initial mount, not on errors
  if (loading && !error && !branding) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading application"
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        Loading configuration...
      </div>
    );
  }

  // Log error but don't block render - config will fall back to defaults
  if (error) {
    console.warn('Config load failed, using defaults:', error);
  }

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Top-level application error:', error, errorInfo);
      }}
    >
      <AnnouncementBanner />
      <AppLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<Navigate to="/" replace />} />
          <Route path="/chat/:threadId" element={<ChatRoutePage />} />
          <Route path="/project/:projectId" element={<ProjectChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/eval/dataset" element={<EvalDatasetPage />} />
        </Routes>
      </AppLayout>
      <ToastNotifications />
    </ErrorBoundary>
  );
}
