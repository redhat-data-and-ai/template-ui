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

await fastify.register(import("@fastify/cors"), {
  origin: 'http://localhost:5173', // Or your specific origin
  optionsSuccessStatus: 200,
  credentials: true
});
export async function setupServer() {
  // Register CORS to allow cross-origin requests

  await fastify.register(import("@fastify/cookie"));
  await fastify.register(import("@fastify/session"), {
    secret:
      process.env.COOKIE_SIGN ||
      "a secret with minimum length of 32 characters",
    cookie: {
      secure: false,
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
