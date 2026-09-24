import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createOpaEngine, type OpaEngine, type PolicyViolation } from "../utils/opa.js";
import { getSettings, type UISettings } from "../utils/settings.js";

declare module "fastify" {
  interface FastifyInstance {
    opa: {
      evaluate(): PolicyViolation[];
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

    const engine = await createOpaEngine(opaCfg.policy_path, {
      info: (msg) => fastify.log.info(msg),
      warn: (msg) => fastify.log.warn(msg),
      error: (msg) => fastify.log.error(msg),
    });

    function evaluate(): PolicyViolation[] {
      const currentCfg = getSettings();
      const input = buildInput(currentCfg);
      return engine.evaluate(input);
    }

    const initialViolations = evaluate();
    if (initialViolations.length > 0) {
      for (const v of initialViolations) {
        fastify.log.warn(`OPA policy violation: ${v.message}`);
      }
      if (opaCfg.fail_on_violation) {
        throw new Error(
          `OPA policy check failed with ${initialViolations.length} violation(s) — set platform.opa.fail_on_violation=false to allow startup`,
        );
      }
    } else if (engine.isLoaded()) {
      fastify.log.info("OPA policy check passed — no violations");
    }

    fastify.decorate("opa", { evaluate, engine });

    fastify.addHook("onClose", () => {
      engine.destroy();
    });
  },
  { name: "opa-plugin" },
);
