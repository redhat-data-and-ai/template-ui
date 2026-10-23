import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
const hashes = new Map<string, Record<string, string>>();
vi.mock('../utils/redis', () => ({
  getRedisClient: () => ({
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => void store.set(k, v),
    hgetall: async (k: string) => ({ ...(hashes.get(k) ?? {}) }),
    hset: async (k: string, fields: Record<string, string>) => {
      hashes.set(k, { ...(hashes.get(k) ?? {}), ...fields });
    },
  }),
}));

const { readOverrides, writeOverrides, OVERRIDABLE } = await import(
  '../utils/feature-overrides'
);

beforeEach(() => {
  store.clear();
  hashes.clear();
});

describe('feature overrides', () => {
  it('is empty before anything is set', async () => {
    expect(await readOverrides()).toEqual({});
  });

  it('round-trips a flag', async () => {
    await writeOverrides({ skills_visible_to_all: false });
    expect(await readOverrides()).toEqual({ skills_visible_to_all: false });
  });

  it('merges rather than replacing', async () => {
    // A client sending one flag must not clear the others.
    await writeOverrides({ skills_visible_to_all: false });
    await writeOverrides({ memory_enabled: false });
    expect(await readOverrides()).toEqual({
      skills_visible_to_all: false,
      memory_enabled: false,
    });
  });

  it('ignores keys outside the allowlist', async () => {
    // Without this a PUT could set auth_enabled:false and turn off
    // authentication from a web form — the flags are merged into the
    // same object the rest of the app reads.
    await writeOverrides({ auth_enabled: false, skills_visible_to_all: false });
    const out = await readOverrides();
    expect(out).not.toHaveProperty('auth_enabled');
    expect(out.skills_visible_to_all).toBe(false);
  });

  it('a concurrent write to another flag is not lost', async () => {
    // Both callers read the same empty snapshot, then write. Under
    // the old read-merge-set this ended with one flag only: each
    // wrote the whole object and the second overwrote the first.
    await Promise.all([
      writeOverrides({ skills_visible_to_all: false }),
      writeOverrides({ memory_enabled: false }),
    ]);
    expect(await readOverrides()).toEqual({
      skills_visible_to_all: false,
      memory_enabled: false,
    });
  });

  it('reads flags written in the old JSON format', async () => {
    store.set(
      'ui:feature-overrides',
      JSON.stringify({ skills_visible_to_all: false }),
    );
    expect(await readOverrides()).toEqual({ skills_visible_to_all: false });
  });

  it('ignores non-boolean values', async () => {
    await writeOverrides({ memory_enabled: 'yes' });
    expect(await readOverrides()).toEqual({});
  });

  it('exposes only the intended flags', () => {
    // The list is the allowlist. Anything added here becomes
    // writable from a web form, so it is asserted explicitly rather
    // than left to grow by accident.
    expect([...OVERRIDABLE]).toEqual([
      'skills_visible_to_all',
      'subagents_visible_to_all',
      'prompt_visible_to_all',
      'models_visible_to_all',
      'safeguards_visible_to_all',
      'memory_enabled',
      'mcp_apps_enabled',
    ]);
  });
});

describe('feature overrides without Redis', () => {
  it('falls back to config rather than failing the page', async () => {
    vi.resetModules();
    vi.doMock('../utils/redis', () => ({ getRedisClient: () => null }));
    const mod = await import('../utils/feature-overrides');
    // A flag store that is down must not take the app with it.
    expect(await mod.readOverrides()).toEqual({});
    await expect(mod.writeOverrides({ memory_enabled: false })).rejects.toThrow(
      /Redis/,
    );
  });
});
