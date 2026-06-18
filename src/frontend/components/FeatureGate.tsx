import { ReactNode } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';

interface FeatureGateProps {
  feature: 'auth' | 'debug' | 'memory';
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * FeatureGate - Conditionally renders children based on feature flags.
 * This is a HARD gate - components are hidden entirely if feature is disabled.
 *
 * Currently only 'auth' is a hard gate. debug_mode_default and memory_enabled_default
 * are defaults for user toggles, not hard gates (users can still change them).
 *
 * Usage: <FeatureGate feature="auth">{authOnlyComponent}</FeatureGate>
 */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const features = useSelector((state: RootState) => state.config.features);

  // If config hasn't loaded yet, don't block render - fall back to showing children
  if (!features) {
    return <>{children}</>;
  }

  const isEnabled = (() => {
    switch (feature) {
      case 'auth':
        return features.auth_enabled ?? true;
      case 'debug':
        // Debug is always available - debug_mode_default only sets initial user toggle state
        return true;
      case 'memory':
        // Memory is always available - memory_enabled_default only sets initial user toggle state
        return true;
      default:
        return true;
    }
  })();

  return isEnabled ? <>{children}</> : <>{fallback}</>;
}
