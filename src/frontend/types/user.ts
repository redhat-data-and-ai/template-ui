export interface UserData {
  accessToken?: string;
  expiresAt?: string | number;
  email: string;
  email_verified: boolean;
  family_name: string;
  given_name: string;
  name: string;
  preferred_username: string;
  sub: string;
}

export interface AppData {
  apiUrl: string;
}

// Extend the Window interface to include USER_DATA and APP_DATA
declare global {
  interface Window {
    USER_DATA: UserData;
    APP_DATA: AppData;
  }
}

export {};
