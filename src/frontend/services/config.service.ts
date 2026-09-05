export interface BrandingThemeColors {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
}

export interface BrandingConfig {
  logo_url: string;
  title: string;
  favicon_url?: string;
  colors: {
    light: BrandingThemeColors;
    dark: BrandingThemeColors;
  };
}

export interface FeaturesConfig {
  debug_mode_default: boolean;
  auth_enabled: boolean;
  mcp_apps_enabled?: boolean;
  memory_enabled: boolean;
  user_rules_enabled: boolean;
}

function getConfigApiBase(): string {
  const basePath = (window.APP_DATA?.basePath || '').replace(/\/$/, '');
  return `${basePath}/api/config`;
}

export const fetchBranding = async (): Promise<BrandingConfig> => {
  const res = await fetch(`${getConfigApiBase()}/branding`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error("Failed to load branding config");
  }
  return res.json();
};

export const fetchFeatures = async (): Promise<FeaturesConfig> => {
  const res = await fetch(`${getConfigApiBase()}/features`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error("Failed to load features config");
  }
  return res.json();
};
