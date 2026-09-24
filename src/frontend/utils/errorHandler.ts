import { APIError, ErrorCode } from '../types/errors';

const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: 'Unable to connect. Please check your network connection.',
  [ErrorCode.CONNECTION_TIMEOUT]: 'The request timed out. Please try again.',
  [ErrorCode.AUTHENTICATION_ERROR]: 'Your session has expired. Please log in again.',
  [ErrorCode.AUTHORIZATION_ERROR]: 'You do not have permission to perform this action.',
  [ErrorCode.RATE_LIMITED]: 'Too many requests. Please wait before trying again.',
  [ErrorCode.STREAM_ERROR]: 'The response stream was interrupted. Please retry.',
  [ErrorCode.STREAM_INTERRUPTED]: 'The connection was lost during streaming.',
  [ErrorCode.VALIDATION_ERROR]: 'Invalid input. Please check your message and try again.',
  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
};

export class ErrorHandler {
  static create(code: ErrorCode, message: string, details?: Record<string, unknown>): APIError {
    return {
      code,
      message,
      retryable: ErrorHandler.isRecoverable(code),
      timestamp: new Date().toISOString(),
      details,
    };
  }

  static fromResponse(status: number, body?: string): APIError {
    let code: ErrorCode;
    let message: string;

    switch (status) {
      case 401:
        code = ErrorCode.AUTHENTICATION_ERROR;
        message = 'Authentication required';
        break;
      case 403:
        code = ErrorCode.AUTHORIZATION_ERROR;
        message = 'Access denied';
        break;
      case 429: {
        code = ErrorCode.RATE_LIMITED;
        message = 'Rate limited';
        break;
      }
      case 502:
      case 503:
      case 504:
        code = ErrorCode.NETWORK_ERROR;
        message = `Service unavailable (${status})`;
        break;
      default:
        code = status >= 400 && status < 500
          ? ErrorCode.VALIDATION_ERROR
          : ErrorCode.UNKNOWN_ERROR;
        message = body || `Request failed with status ${status}`;
    }

    return {
      code,
      message,
      status,
      retryable: ErrorHandler.isRecoverable(code),
      timestamp: new Date().toISOString(),
    };
  }

  static fromFetchError(error: unknown): APIError {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return ErrorHandler.create(ErrorCode.NETWORK_ERROR, error.message);
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return ErrorHandler.create(ErrorCode.STREAM_INTERRUPTED, 'Request was cancelled');
    }
    const message = error instanceof Error ? error.message : String(error);
    return ErrorHandler.create(ErrorCode.UNKNOWN_ERROR, message);
  }

  static isRecoverable(code: ErrorCode): boolean {
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.CONNECTION_TIMEOUT,
      ErrorCode.STREAM_ERROR,
      ErrorCode.STREAM_INTERRUPTED,
      ErrorCode.RATE_LIMITED,
    ].includes(code);
  }

  static getUserMessage(error: APIError): string {
    return USER_MESSAGES[error.code] || USER_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }

  static getRetryDelay(retryCount: number, baseDelay = 1000): number {
    return Math.min(baseDelay * Math.pow(2, retryCount), 30000);
  }
}
