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

// Extend the Window interface to include USER_DATA
declare global {
  interface Window {
    USER_DATA: UserData;
  }
}

export {};
