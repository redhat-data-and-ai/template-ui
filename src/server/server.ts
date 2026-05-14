import Fastify from "fastify";
import { clientRoutes } from "./router/client.router.js";
import { apiRoutes } from "./router/api.router.js";
import { proxyRoutes } from "./router/proxy.router.js";
import logoutPlugin from "./router/logout.router.js";
import { authPlugin } from "./plugins/auth.plugin.js";
import { buildSessionStore } from "./utils/redis.js";

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
  production: boolean;
  test: boolean;
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
  production: false,
  test: false,
};

const environment =
  (process.env.ENVIRONMENT as keyof LoggerConfig) || "production";

const fastify = Fastify({
  logger: envToLogger[environment] ?? true,
});

await fastify.register(import("@fastify/cors"), {
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  optionsSuccessStatus: 200,
  credentials: true,
});

export async function setupServer() {
  const store = buildSessionStore();
  if (store) {
    console.log('[Session] Using Redis-backed session store');
  } else {
    console.log('[Session] Using in-memory session store (no REDIS_HOST)');
  }

  await fastify.register(import("@fastify/cookie"));
  await fastify.register(import("@fastify/session"), {
    secret:
      process.env.COOKIE_SIGN ||
      "a secret with minimum length of 32 characters",
    cookie: {
      secure: process.env.ENVIRONMENT === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30,
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
