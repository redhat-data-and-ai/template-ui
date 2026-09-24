import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBranding, fetchFeatures } from './config.service';

describe('config.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).APP_DATA = { basePath: '/' };
  });

  describe('fetchBranding', () => {
    it('fetches from /api/config/branding and returns data', async () => {
      const branding = {
        logo_url: '/logo.png',
        title: 'Test',
        colors: { light: {}, dark: {} },
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(branding),
      }));

      const result = await fetchBranding();
      expect(result).toEqual(branding);
      expect(fetch).toHaveBeenCalledWith('/api/config/branding', { cache: 'no-store' });
    });

    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      await expect(fetchBranding()).rejects.toThrow('Failed to load branding config');
    });

    it('uses basePath from APP_DATA', async () => {
      (window as any).APP_DATA = { basePath: '/app/myagent' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }));

      await fetchBranding();
      expect(fetch).toHaveBeenCalledWith('/app/myagent/api/config/branding', { cache: 'no-store' });
    });
  });

  describe('fetchFeatures', () => {
    it('fetches from /api/config/features and returns data', async () => {
      const features = { debug_mode_default: false, auth_enabled: true, memory_enabled: true };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(features),
      }));

      const result = await fetchFeatures();
      expect(result).toEqual(features);
    });

    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      await expect(fetchFeatures()).rejects.toThrow('Failed to load features config');
    });
  });
});
