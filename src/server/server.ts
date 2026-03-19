import Fastify from "fastify";
import { clientRoutes } from "./router/client.router.js";
import { apiRoutes } from "./router/api.router.js";
import { authPlugin } from "./plugins/auth.plugin.js";

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

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
fastify.log.info({ corsOrigin }, "CORS origin configured");

await fastify.register(import("@fastify/cors"), {
  origin: corsOrigin,
  optionsSuccessStatus: 200,
  credentials: true,
});

export async function setupServer() {
  if (environment !== "development" && !process.env.COOKIE_SIGN) {
    throw new Error(
      "COOKIE_SIGN environment variable is required outside development. " +
      "Set COOKIE_SIGN or ENVIRONMENT=development to use the default.",
    );
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
  });

  if (process.env.AUTH_ENABLED === "true") {
    await fastify.register(authPlugin);
  }

  await fastify.register(apiRoutes, { prefix: "/api" });
  
  await fastify.register(clientRoutes);

  return fastify;
}
