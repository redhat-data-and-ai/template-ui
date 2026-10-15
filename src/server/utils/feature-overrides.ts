import { getRedisClient } from './redis.js';

/**
 * Deployment-wide feature flags an operator can change at runtime.
 *
 * `config/ui/settings.yaml` holds the defaults. This holds the
 * deltas, in Redis, because the ConfigMap is mounted read-only and
 * a pod cannot write back to it — and should not, since the next
 * `apply -k` would overwrite whatever it wrote.
 *
 * Shared storage rather than per-browser, which is the whole point:
 * these decide what *every* user sees, so a `localStorage` toggle
 * would change what the operator flipping it sees and nobody else.
 *
 * Redis is already a dependency here (it backs sessions) and it has
 * a PVC, so an override survives a restart. If Redis is unavailable
 * the config defaults apply unchanged — the flags fail back to the
 * reviewed value rather than to whatever was last clicked.
 */

const KEY = 'ui:feature-overrides';

/** Only these may be overridden at runtime. */
export const OVERRIDABLE = [
  'skills_visible_to_all',
  'subagents_visible_to_all',
  'prompt_visible_to_all',
  'models_visible_to_all',
  'safeguards_visible_to_all',
  'memory_enabled',
  'mcp_apps_enabled',
] as const;

export type OverridableFeature = (typeof OVERRIDABLE)[number];

export type FeatureOverrides = Partial<Record<OverridableFeature, boolean>>;

/**
 * An allowlist, not a denylist.
 *
 * Without it a `PUT` could set `auth_enabled: false` and turn off
 * authentication from a web form — the flags are merged into the
 * same object the rest of the app reads, so anything writable here
 * is writable everywhere it is consulted.
 */
function sanitise(input: unknown): FeatureOverrides {
  const out: FeatureOverrides = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of OVERRIDABLE) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export async function readOverrides(): Promise<FeatureOverrides> {
  const redis = getRedisClient();
  if (!redis) return {};
  try {
    const raw = await redis.get(KEY);
    return raw ? sanitise(JSON.parse(raw)) : {};
  } catch {
    // A flag store that is down must not take the app with it. The
    // reviewed config is a safe answer; a 500 on every page load is
    // not.
    return {};
  }
}

export async function writeOverrides(
  input: unknown,
): Promise<FeatureOverrides> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error(
      'Feature overrides need Redis, which is not configured for this deployment.',
    );
  }
  // Merged, not replaced: a client sending one flag must not clear
  // the others it did not mention.
  const merged = { ...(await readOverrides()), ...sanitise(input) };
  await redis.set(KEY, JSON.stringify(merged));
  return merged;
}
