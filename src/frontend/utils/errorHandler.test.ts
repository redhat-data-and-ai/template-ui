import { describe, it, expect } from 'vitest';
import { ErrorHandler } from './errorHandler';
import { ErrorCode } from '../types/errors';

describe('ErrorHandler', () => {
  describe('create', () => {
    it('creates an APIError with the given code and message', () => {
      const err = ErrorHandler.create(ErrorCode.NETWORK_ERROR, 'oops');
      expect(err.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(err.message).toBe('oops');
      expect(err.retryable).toBe(true);
      expect(err.timestamp).toBeTruthy();
    });

    it('includes optional details', () => {
      const err = ErrorHandler.create(ErrorCode.VALIDATION_ERROR, 'bad', { field: 'name' });
      expect(err.details).toEqual({ field: 'name' });
      expect(err.retryable).toBe(false);
    });
  });

  describe('fromResponse', () => {
    it('maps 401 to AUTHENTICATION_ERROR', () => {
      const err = ErrorHandler.fromResponse(401);
      expect(err.code).toBe(ErrorCode.AUTHENTICATION_ERROR);
      expect(err.status).toBe(401);
      expect(err.retryable).toBe(false);
    });

    it('maps 403 to AUTHORIZATION_ERROR', () => {
      const err = ErrorHandler.fromResponse(403);
      expect(err.code).toBe(ErrorCode.AUTHORIZATION_ERROR);
      expect(err.retryable).toBe(false);
    });

    it('maps 429 to RATE_LIMITED', () => {
      const err = ErrorHandler.fromResponse(429);
      expect(err.code).toBe(ErrorCode.RATE_LIMITED);
      expect(err.retryable).toBe(true);
    });

    it('maps 502/503/504 to NETWORK_ERROR', () => {
      for (const status of [502, 503, 504]) {
        const err = ErrorHandler.fromResponse(status);
        expect(err.code).toBe(ErrorCode.NETWORK_ERROR);
        expect(err.retryable).toBe(true);
      }
    });

    it('maps 4xx to VALIDATION_ERROR', () => {
      const err = ErrorHandler.fromResponse(400);
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('maps 5xx (non-502/503/504) to UNKNOWN_ERROR', () => {
      const err = ErrorHandler.fromResponse(500);
      expect(err.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('uses body as message for default cases', () => {
      const err = ErrorHandler.fromResponse(400, 'Invalid payload');
      expect(err.message).toBe('Invalid payload');
    });

    it('falls back to status text when no body', () => {
      const err = ErrorHandler.fromResponse(418);
      expect(err.message).toContain('418');
    });
  });

  describe('fromFetchError', () => {
    it('creates NETWORK_ERROR from TypeError with fetch', () => {
      const err = ErrorHandler.fromFetchError(new TypeError('fetch failed'));
      expect(err.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('creates STREAM_INTERRUPTED from AbortError DOMException', () => {
      const err = ErrorHandler.fromFetchError(new DOMException('aborted', 'AbortError'));
      expect(err.code).toBe(ErrorCode.STREAM_INTERRUPTED);
    });

    it('creates UNKNOWN_ERROR from generic Error', () => {
      const err = ErrorHandler.fromFetchError(new Error('something broke'));
      expect(err.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(err.message).toBe('something broke');
    });

    it('handles non-Error values', () => {
      const err = ErrorHandler.fromFetchError('string error');
      expect(err.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(err.message).toBe('string error');
    });
  });

  describe('isRecoverable', () => {
    it('returns true for recoverable codes', () => {
      expect(ErrorHandler.isRecoverable(ErrorCode.NETWORK_ERROR)).toBe(true);
      expect(ErrorHandler.isRecoverable(ErrorCode.CONNECTION_TIMEOUT)).toBe(true);
      expect(ErrorHandler.isRecoverable(ErrorCode.STREAM_ERROR)).toBe(true);
      expect(ErrorHandler.isRecoverable(ErrorCode.STREAM_INTERRUPTED)).toBe(true);
      expect(ErrorHandler.isRecoverable(ErrorCode.RATE_LIMITED)).toBe(true);
    });

    it('returns false for non-recoverable codes', () => {
      expect(ErrorHandler.isRecoverable(ErrorCode.AUTHENTICATION_ERROR)).toBe(false);
      expect(ErrorHandler.isRecoverable(ErrorCode.AUTHORIZATION_ERROR)).toBe(false);
      expect(ErrorHandler.isRecoverable(ErrorCode.VALIDATION_ERROR)).toBe(false);
      expect(ErrorHandler.isRecoverable(ErrorCode.UNKNOWN_ERROR)).toBe(false);
    });
  });

  describe('getUserMessage', () => {
    it('returns the mapped user message for known codes', () => {
      const err = ErrorHandler.create(ErrorCode.NETWORK_ERROR, 'x');
      expect(ErrorHandler.getUserMessage(err)).toBe('Unable to connect. Please check your network connection.');
    });

    it('returns the UNKNOWN_ERROR message for unmapped codes', () => {
      const err = ErrorHandler.create('FAKE_CODE' as ErrorCode, 'x');
      expect(ErrorHandler.getUserMessage(err)).toBe('An unexpected error occurred. Please try again.');
    });

    it('returns specific message for each error code', () => {
      const codes = [
        ErrorCode.CONNECTION_TIMEOUT,
        ErrorCode.AUTHENTICATION_ERROR,
        ErrorCode.AUTHORIZATION_ERROR,
        ErrorCode.RATE_LIMITED,
        ErrorCode.STREAM_ERROR,
        ErrorCode.STREAM_INTERRUPTED,
        ErrorCode.VALIDATION_ERROR,
      ];
      for (const code of codes) {
        const err = ErrorHandler.create(code, 'test');
        expect(ErrorHandler.getUserMessage(err)).toBeTruthy();
        expect(ErrorHandler.getUserMessage(err)).not.toBe('');
      }
    });
  });

  describe('getRetryDelay', () => {
    it('returns exponential backoff from base delay', () => {
      expect(ErrorHandler.getRetryDelay(0)).toBe(1000);
      expect(ErrorHandler.getRetryDelay(1)).toBe(2000);
      expect(ErrorHandler.getRetryDelay(2)).toBe(4000);
      expect(ErrorHandler.getRetryDelay(3)).toBe(8000);
    });

    it('caps at 30 seconds', () => {
      expect(ErrorHandler.getRetryDelay(20)).toBe(30000);
    });

    it('respects custom base delay', () => {
      expect(ErrorHandler.getRetryDelay(0, 500)).toBe(500);
      expect(ErrorHandler.getRetryDelay(1, 500)).toBe(1000);
    });
  });
});
