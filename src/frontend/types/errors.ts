export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  STREAM_ERROR = 'STREAM_ERROR',
  STREAM_INTERRUPTED = 'STREAM_INTERRUPTED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface APIError {
  code: ErrorCode;
  message: string;
  status?: number;
  retryable: boolean;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
  timestamp: string;
}
