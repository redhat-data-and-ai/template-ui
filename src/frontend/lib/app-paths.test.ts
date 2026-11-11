import { afterEach, describe, expect, it } from 'vitest';
import { getAgentStorageScope, scopedStorageKey } from './app-paths';

describe('getAgentStorageScope', () => {
  const originalAppData = window.APP_DATA;

  afterEach(() => {
    window.APP_DATA = originalAppData;
    window.history.pushState({}, '', '/');
  });

  it('keeps settings on one key for the chat page and the settings page', () => {
    window.APP_DATA = { ...originalAppData, basePath: '/' };
    window.history.pushState({}, '', '/chat/abc');
    expect(getAgentStorageScope()).toBe('');
    expect(scopedStorageKey('template-ui-settings')).toBe('template-ui-settings');

    window.history.pushState({}, '', '/settings');
    expect(scopedStorageKey('template-ui-settings')).toBe('template-ui-settings');
  });

  it('keeps a scope when the app is mounted under a base path', () => {
    window.APP_DATA = { ...originalAppData, basePath: '/agents/example' };
    window.history.pushState({}, '', '/chat/abc');
    expect(getAgentStorageScope()).toBe('agents/example');
    expect(scopedStorageKey('template-ui-settings')).toBe('template-ui-settings:agents/example');
  });
});
