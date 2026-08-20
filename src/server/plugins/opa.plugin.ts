import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpaEngine, type OpaEngine, type PolicyViolation, type EvaluationResult } from "../utils/opa.js";
import { getSettings, type UISettings } from "../utils/settings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ControlStatus {
  id: string;
  status: "pass" | "fail" | "warn" | "off";
  mode: "OFF" | "WARN" | "ENFORCE";
  reason?: string;
}

export interface ComplianceState {
  status: "compliant" | "non_compliant" | "disabled";
  evaluated_at: string;
  controls: ControlStatus[];
}

declare module "fastify" {
  interface FastifyInstance {
    opa: {
      evaluate(): PolicyViolation[];
      evaluateWithModes(): EvaluationResult;
      engine: OpaEngine;
    };
    compliance: ComplianceState;
  }
}

function loadModes(policyPath: string): Record<string, string> {
  const policyDir = policyPath && !policyPath.startsWith("/")
    ? resolve(__dirname, "../../../", policyPath)
    : policyPath || resolve(__dirname, "../../../config/compliance");
  const modesFile = resolve(policyDir, "modes.json");
  if (!existsSync(modesFile)) return {};
  try {
    const raw = JSON.parse(readFileSync(modesFile, "utf-8"));
    return raw.modes ?? {};
  } catch {
    return {};
  }
}

function buildComplianceState(
  result: EvaluationResult,
  modes: Record<string, string>,
): ComplianceState {
  const controls: ControlStatus[] = [];

  for (const [controlId, mode] of Object.entries(modes)) {
    const upperMode = mode.toUpperCase() as "OFF" | "WARN" | "ENFORCE";
    if (upperMode === "OFF") {
      controls.push({ id: controlId, status: "off", mode: "OFF" });
      continue;
    }

    const denial = result.denials.find((v) => v.id === controlId);
    if (denial) {
      controls.push({ id: controlId, status: "fail", mode: "ENFORCE", reason: denial.message });
      continue;
    }

    const warning = result.warnings.find((v) => v.id === controlId);
    if (warning) {
      controls.push({ id: controlId, status: "warn", mode: "WARN", reason: warning.message });
      continue;
    }

    controls.push({ id: controlId, status: "pass", mode: upperMode });
  }

  const hasFailures = controls.some((c) => c.status === "fail");
  return {
    status: hasFailures ? "non_compliant" : "compliant",
    evaluated_at: new Date().toISOString(),
    controls,
  };
}

function buildInput(cfg: UISettings): Record<string, unknown> {
  const opaCfg = cfg.platform.opa;
  return {
    branding: cfg.branding,
    features: cfg.features,
    agent: cfg.agent,
    security: cfg.security,
    auth_provider: process.env.SSO_AUTH_PROVIDER || "oidc",
    platform: {
      opa: {
        approved_auth_providers: opaCfg.approved_auth_providers,
        internal_endpoint_suffixes: opaCfg.internal_endpoint_suffixes,
        max_session_ttl_days: opaCfg.max_session_ttl_days,
        restrict_debug_mode: opaCfg.restrict_debug_mode,
        restricted_features: opaCfg.restricted_features,
        max_rate_limit: opaCfg.max_rate_limit,
      },
    },
  };
}

export default fp(
  async function opaPlugin(fastify: FastifyInstance) {
    const cfg = getSettings();
    const opaCfg = cfg.platform.opa;

    const engine = await createOpaEngine(
      opaCfg.policy_path,
      {
        info: (msg) => fastify.log.info(msg),
        warn: (msg) => fastify.log.warn(msg),
        error: (msg) => fastify.log.error(msg),
      },
      opaCfg.overrides_path,
    );

    const modes = loadModes(opaCfg.policy_path);

    function evaluate(): PolicyViolation[] {
      const currentCfg = getSettings();
      const input = buildInput(currentCfg);
      return engine.evaluate(input);
    }

    function evaluateWithModes(): EvaluationResult {
      const currentCfg = getSettings();
      const input = buildInput(currentCfg);
      return engine.evaluateWithModes(input);
    }

    const initialResult = evaluateWithModes();

    for (const v of initialResult.denials) {
      fastify.log.warn(`OPA policy ENFORCE violation: ${v.message}`);
    }
    for (const v of initialResult.warnings) {
      fastify.log.warn(`OPA policy WARN violation: ${v.message}`);
    }

    if (initialResult.denials.length > 0 && opaCfg.fail_on_violation) {
      throw new Error(
        `OPA policy check failed with ${initialResult.denials.length} ENFORCE violation(s) — set platform.opa.fail_on_violation=false to allow startup`,
      );
    }

    if (initialResult.denials.length === 0 && initialResult.warnings.length === 0 && engine.isLoaded()) {
      fastify.log.info("OPA policy check passed — no violations");
    }

    fastify.decorate("opa", { evaluate, evaluateWithModes, engine });
    fastify.decorate("compliance", buildComplianceState(initialResult, modes));

    fastify.addHook("onClose", () => {
      engine.destroy();
    });
  },
  { name: "opa-plugin" },
);
