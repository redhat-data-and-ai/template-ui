import { describe, it, expect, vi } from 'vitest';
import configReducer, { setBranding, setFeatures, setError, loadConfig } from './config';

vi.mock('../../services/config.service', () => ({
  fetchBranding: vi.fn(),
  fetchFeatures: vi.fn(),
  fetchContent: vi.fn(),
}));

import { fetchBranding, fetchFeatures, fetchContent } from '../../services/config.service';
import type { BrandingConfig, FeaturesConfig, ContentConfig } from '../../services/config.service';
import { configureStore } from '@reduxjs/toolkit';

const mockBranding: BrandingConfig = {
  logo_url: '/logo.png',
  title: 'Test Agent',
  colors: {
    light: { primary: '#000', accent: '#111', background: '#fff', foreground: '#000' },
    dark: { primary: '#fff', accent: '#eee', background: '#000', foreground: '#fff' },
  },
};

const mockFeatures: FeaturesConfig = {
  debug_mode_default: false,
  auth_enabled: true,
  memory_enabled: true,
};

const mockContent: ContentConfig = {
  greeting: 'Hey {user}!',
  greeting_anonymous: 'Hey there!',
  subtitle: '{agent} is ready.',
  quick_prompts_heading: 'Try one',
  quick_prompts: ['What can {agent} do?'],
  input_placeholder: 'Ask {agent}...',
  welcome_heading: 'Welcome to {agent}!',
  welcome_subtitle: 'How can I help?',
};

function initialState() {
  return configReducer(undefined, { type: '@@INIT' });
}

describe('config slice', () => {
  describe('reducers', () => {
    it('starts with null branding and features', () => {
      const state = initialState();
      expect(state.branding).toBeNull();
      expect(state.features).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('setBranding sets branding', () => {
      const state = configReducer(initialState(), setBranding(mockBranding));
      expect(state.branding).toEqual(mockBranding);
    });

    it('setFeatures sets features', () => {
      const state = configReducer(initialState(), setFeatures(mockFeatures));
      expect(state.features).toEqual(mockFeatures);
    });

    it('setError sets error and stops loading', () => {
      const loadingState = { ...initialState(), loading: true };
      const state = configReducer(loadingState, setError('Something failed'));
      expect(state.error).toBe('Something failed');
      expect(state.loading).toBe(false);
    });
  });

  describe('loadConfig thunk', () => {
    it('sets loading on pending', () => {
      const state = configReducer(initialState(), { type: loadConfig.pending.type });
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('populates branding and features on fulfilled', () => {
      const state = configReducer(initialState(), {
        type: loadConfig.fulfilled.type,
        payload: { branding: mockBranding, features: mockFeatures, content: mockContent },
      });
      expect(state.branding).toEqual(mockBranding);
      expect(state.features).toEqual(mockFeatures);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on rejected', () => {
      const state = configReducer(initialState(), {
        type: loadConfig.rejected.type,
        error: { message: 'Network error' },
      });
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Network error');
    });

    it('uses default error message when error.message is undefined', () => {
      const state = configReducer(initialState(), {
        type: loadConfig.rejected.type,
        error: {},
      });
      expect(state.error).toBe('Failed to load config');
    });

    it('dispatches the thunk end-to-end', async () => {
      vi.mocked(fetchBranding).mockResolvedValue(mockBranding);
      vi.mocked(fetchFeatures).mockResolvedValue(mockFeatures);
      vi.mocked(fetchContent).mockResolvedValue(mockContent);

      const store = configureStore({ reducer: { config: configReducer } });
      await store.dispatch(loadConfig());

      const state = store.getState().config;
      expect(state.branding).toEqual(mockBranding);
      expect(state.features).toEqual(mockFeatures);
    });
  });
});
