import Fastify from "fastify";
import { clientRoutes } from "./router/client.router.js";
import { apiRoutes } from "./router/api.router.js";
import { proxyRoutes } from "./router/proxy.router.js";
import logoutPlugin from "./router/logout.router.js";
import { authPlugin } from "./plugins/auth.plugin.js";
import { buildSessionStore } from "./utils/redis.js";
import tracePlugin from "./plugins/trace.plugin.js";
import { getSettings } from "./utils/settings.js";

const cfg = getSettings();

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

await fastify.register(tracePlugin);

await fastify.register(import("@fastify/cors"), {
  origin: process.env.CORS_ORIGIN || cfg.cors.origin,
  optionsSuccessStatus: 200,
  credentials: true,
});

export async function setupServer() {
  const store = buildSessionStore();
  if (store) {
    fastify.log.info("Using Redis-backed session store");
  } else {
    fastify.log.info("Using in-memory session store (no REDIS_HOST)");
  }

  if (cfg.security.helmet.enabled) {
    const csp = cfg.security.helmet.csp;
    await fastify.register(import("@fastify/helmet"), {
      crossOriginEmbedderPolicy: cfg.security.helmet.cross_origin_embedder_policy,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: csp.default_src,
          scriptSrc: csp.script_src,
          styleSrc: csp.style_src,
          imgSrc: csp.img_src,
          connectSrc: csp.connect_src,
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
      maxAge: 1000 * 60 * 60 * 24 * cfg.security.session.max_age_days,
    },
    ...(store ? { store } : {}),
  });

  if (process.env.AUTH_ENABLED === "true") {
    await fastify.register(authPlugin);
  }

  await fastify.register(logoutPlugin);

  await fastify.register(apiRoutes, { prefix: "/api" });
  await fastify.register(proxyRoutes, { prefix: "/api" });

  await fastify.register(clientRoutes);

  return fastify;
}
