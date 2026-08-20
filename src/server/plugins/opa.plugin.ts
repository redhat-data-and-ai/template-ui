import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { trace } from "@opentelemetry/api";
import { createOpaEngine, type OpaEngine, type PolicyViolation, type EvaluationResult } from "../utils/opa.js";
import { getSettings, type UISettings } from "../utils/settings.js";

const tracer = trace.getTracer("opa-plugin");

declare module "fastify" {
  interface FastifyInstance {
    opa: {
      evaluate(): PolicyViolation[];
      evaluateWithModes(): EvaluationResult;
      engine: OpaEngine;
    };
  }
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

    function evaluate(): PolicyViolation[] {
      const currentCfg = getSettings();
      const input = buildInput(currentCfg);
      return engine.evaluate(input);
    }

    function evaluateWithModes(): EvaluationResult {
      const currentCfg = getSettings();
      const input = buildInput(currentCfg);
      return tracer.startActiveSpan("opa.evaluate", (span) => {
        const result = engine.evaluateWithModes(input);

        span.setAttribute("opa.denials_count", result.denials.length);
        span.setAttribute("opa.warnings_count", result.warnings.length);
        if (result.denials.length > 0) {
          span.setAttribute("opa.decision", "denied");
          span.setAttribute("opa.denial_messages", result.denials.map((v) => v.message));
        } else if (result.warnings.length > 0) {
          span.setAttribute("opa.decision", "warn");
          span.setAttribute("opa.warning_messages", result.warnings.map((v) => v.message));
        } else {
          span.setAttribute("opa.decision", "allowed");
        }
        span.end();
        return result;
      });
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

    fastify.addHook("onClose", () => {
      engine.destroy();
    });
  },
  { name: "opa-plugin" },
);
