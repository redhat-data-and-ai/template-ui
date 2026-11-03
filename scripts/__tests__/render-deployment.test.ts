/**
 * The deployment renderer: config/ui/deployment/values.yaml is the source of truth.
 *
 * The test that matters most is the drift check — if someone edits a
 * generated.yaml by hand, CI has to say so.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import { plan, renderPatches, loadValues, ensurePatchReference } from '../render-deployment';

const VALUES = loadValues();

function docs(text: string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const doc of yaml.loadAll(text) as any[]) {
    if (doc) out[`${doc.kind}/${doc.metadata.name}`] = doc;
  }
  return out;
}

function forTargetValues(target: string) {
  // plan() applies the overrides internally; re-derive them here so the
  // assertions read against what a target actually gets.
  const merged = structuredClone(VALUES);
  const overrides = merged.targets?.[target] ?? {};
  const deepMerge = (a: any, b: any): any => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] =
        v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object'
          ? deepMerge(out[k], v)
          : v;
    }
    return out;
  };
  const result = deepMerge(merged, overrides);
  delete result.targets;
  return result;
}

describe('committed output is current', () => {
  it('no overlay has drifted from deployment.yaml', () => {
    const stale = [...plan(VALUES)]
      .filter(([path, text]) => !existsSync(path) || readFileSync(path, 'utf8') !== text)
      .map(([path]) => path);

    expect(stale, 'run `make render-deployment`').toEqual([]);
  });
});

describe('values reach the manifests', () => {
  const openshift = docs(renderPatches(forTargetValues('openshift'), 'openshift'));

  it('replicas come from config', () => {
    expect(openshift['Deployment/template-ui'].spec.replicas).toBe(VALUES.app.replicas);
  });

  it('resource limits come from config', () => {
    const container =
      openshift['Deployment/template-ui'].spec.template.spec.containers[0];
    expect(container.resources.limits.memory).toBe(VALUES.resources.limits.memory);
  });

  it('names the container so strategic merge edits it', () => {
    // Without the name, merge appends a second container.
    const container =
      openshift['Deployment/template-ui'].spec.template.spec.containers[0];
    expect(container.name).toBe('template-ui');
  });

  it('keeps the port on httpGet, which merge replaces wholesale', () => {
    const container =
      openshift['Deployment/template-ui'].spec.template.spec.containers[0];
    expect(container.livenessProbe.httpGet.port).toBe(VALUES.container.port);
    expect(container.livenessProbe.httpGet.path).toBe(VALUES.probes.liveness.path);
  });

  it('build resources come from config', () => {
    expect(openshift['BuildConfig/template-ui'].spec.resources.limits.memory).toBe(
      VALUES.build.resources.limits.memory,
    );
  });
});

describe('per-target overrides', () => {
  it('kind runs one replica, openshift two', () => {
    expect(forTargetValues('kind').app.replicas).toBe(1);
    expect(forTargetValues('openshift').app.replicas).toBe(2);
  });

  it('deep-merges rather than replacing a whole section', () => {
    // kind overrides resources.limits.memory only; cpu must survive.
    const kind = forTargetValues('kind');
    expect(kind.resources.limits.memory).toBe('512Mi');
    expect(kind.resources.limits.cpu).toBe(VALUES.resources.limits.cpu);
  });

  it('never leaks the targets key into a manifest', () => {
    expect(forTargetValues('openshift').targets).toBeUndefined();
  });
});

describe('resources the overlay does not have are not patched', () => {
  it('kind gets no Route or BuildConfig patch', () => {
    // Patching a resource kustomize cannot find fails the whole render.
    const kind = docs(renderPatches(forTargetValues('kind'), 'kind'));
    expect(kind['Route/template-ui']).toBeUndefined();
    expect(kind['BuildConfig/template-ui']).toBeUndefined();
  });

  it('a disabled route emits no patch', () => {
    const values = structuredClone(forTargetValues('openshift'));
    values.networking.route.enabled = false;
    expect(docs(renderPatches(values, 'openshift'))['Route/template-ui']).toBeUndefined();
  });
});

describe('patch wiring', () => {
  it('adds generated.yaml to an overlay that has no patches block', () => {
    const out = ensurePatchReference('resources:\n  - ../../base\n');
    expect(out).toContain('patches:\n  - path: generated.yaml');
  });

  it('is idempotent', () => {
    const once = ensurePatchReference('resources:\n  - ../../base\n');
    expect(ensurePatchReference(once)).toBe(once);
  });
});
