import { ReactNode } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';

interface FeatureGateProps {
  feature: 'auth' | 'debug' | 'memory' | 'user_rules';
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * FeatureGate - Conditionally renders children based on feature flags.
 * This is a HARD gate - components are hidden entirely if feature is disabled.
 *
 * Currently only 'auth' is a hard gate. debug_mode_default is a default for a user
 * toggle, not a hard gate (users can still change it).
 *
 * Usage: <FeatureGate feature="auth">{authOnlyComponent}</FeatureGate>
 */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const features = useSelector((state: RootState) => state.config.features);

  if (!features) {
    return <>{children}</>;
  }

  const isEnabled = (() => {
    switch (feature) {
      case 'auth':
        return features.auth_enabled ?? true;
      case 'memory':
        return features.memory_enabled ?? true;
      case 'user_rules':
        return features.user_rules_enabled ?? true;
      case 'debug':
        return true;
      default:
        return true;
    }
  })();

  return isEnabled ? <>{children}</> : <>{fallback}</>;
}
