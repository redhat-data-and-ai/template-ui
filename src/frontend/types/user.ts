export interface UserData {
  accessToken: string;
  expiresAt: string;
  cn: string;
  displayName: string;
  email: string;
  email_verified: boolean;
  family_name: string;
  givenName: string;
  given_name: string;
  mail: string; 
  name: string;
  preferred_username: string;
  rhatUUID: string;
  sn: string;
  sub: string;
}

import type { BrandingConfig, FeaturesConfig } from '../services/config.service';

export interface AppData {
  apiUrl: string;
  refreshableToken: string;
  agentName: string;
  basePath?: string;
  branding?: BrandingConfig;
  features?: FeaturesConfig;
}

// Extend the Window interface to include USER_DATA and APP_DATA
declare global {
  interface Window {
    USER_DATA: UserData;
    APP_DATA: AppData;
  }
}

export {};
