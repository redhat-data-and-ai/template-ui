import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { clientRoutes } from "./router/client.router.js";
import { apiRoutes } from "./router/api.router.js";
import { proxyRoutes } from "./router/proxy.router.js";
import logoutPlugin from "./router/logout.router.js";
import { authPlugin } from "./plugins/auth.plugin.js";
import opaPlugin from "./plugins/opa.plugin.js";
import { buildSessionStore, connectRedis } from "./utils/redis.js";
import tracePlugin from "./plugins/trace.plugin.js";
import { getSettings } from "./utils/settings.js";

interface LoggerConfig {
  development: {
    transport: {
      target: string;
      options: {
        translateTime: string;
        ignore: string;
      };
    };
  };
  production: { level: string };
  test: { level: string };
}

export async function setupServer(): Promise<FastifyInstance> {
  const cfg = getSettings();

  const envToLogger: LoggerConfig = {
    development: {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    },
    production: {
      level: cfg.logging.level,
    },
    test: { level: "silent" },
  };

  const environment =
    (process.env.ENVIRONMENT as keyof LoggerConfig) || "production";

  const fastify = Fastify({
    logger: envToLogger[environment] ?? true,
    bodyLimit: cfg.server.body_limit,
  });

  // Explicitly remove information disclosure headers
  fastify.addHook('onSend', async (request, reply) => {
    reply.removeHeader('X-Powered-By');
    reply.removeHeader('Server');
  });

  await fastify.register(tracePlugin);

  await fastify.register(import("@fastify/cors"), {
    origin: process.env.CORS_ORIGIN || cfg.cors.origin,
    optionsSuccessStatus: 200,
    credentials: true,
  });
  await connectRedis();
  const store = buildSessionStore();
  if (store) {
    fastify.log.info("Using Redis-backed session store");
  } else {
    fastify.log.info("Using in-memory session store (no REDIS_HOST)");
  }

  if (cfg.security.helmet.enabled) {
    const csp = cfg.security.helmet.csp;

    // Build connect-src with agent endpoint
    const connectSrc = [...csp.connect_src];
    if (cfg.agent.endpoint) {
      try {
        const agentUrl = new URL(cfg.agent.endpoint);
        const agentOrigin = `${agentUrl.protocol}//${agentUrl.host}`;
        if (!connectSrc.includes(agentOrigin)) {
          connectSrc.push(agentOrigin);
        }
      } catch {
        fastify.log.warn('Invalid agent.endpoint URL, not added to CSP connect-src');
      }
    }

    await fastify.register(import("@fastify/helmet"), {
      crossOriginEmbedderPolicy: cfg.security.helmet.cross_origin_embedder_policy,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: csp.default_src,
          scriptSrc: csp.script_src,
          styleSrc: csp.style_src,
          imgSrc: csp.img_src,
          connectSrc: connectSrc,
          fontSrc: csp.font_src,
          objectSrc: csp.object_src,
          frameAncestors: csp.frame_ancestors,
        },
      },
    });
  }

  if (cfg.security.rate_limit.enabled) {
    const rl = cfg.security.rate_limit;
    const excludeSet = new Set(rl.exclude_paths);
    await fastify.register(import("@fastify/rate-limit"), {
      max: rl.max,
      timeWindow: rl.window,
      allowList: (request) => {
        const path = request.url.split("?")[0];
        return excludeSet.has(path);
      },
    });
  }

  await fastify.register(import("@fastify/cookie"));
  await fastify.register(import("@fastify/session"), {
    secret:
      process.env.COOKIE_SIGN ||
      "a secret with minimum length of 32 characters",
    cookie: {
      secure: cfg.security.session.secure_cookie,
      httpOnly: cfg.security.session.http_only ?? true,
      sameSite: cfg.security.session.same_site ?? 'lax',
      maxAge: 1000 * 60 * 60 * 24 * cfg.security.session.max_age_days,
      path: '/',
    },
    ...(store ? { store } : {}),
  });

  if (cfg.features.auth_enabled) {
    await fastify.register(authPlugin);
  }

  if (cfg.platform.opa.enabled) {
    await fastify.register(opaPlugin);
  }

  await fastify.register(logoutPlugin);

  await fastify.register(apiRoutes, { prefix: "/api" });
  await fastify.register(proxyRoutes, { prefix: "/api" });

  await fastify.register(clientRoutes);

  return fastify;
}
