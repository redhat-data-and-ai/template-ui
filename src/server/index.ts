import { shutdownTracing, startTracing } from "./tracing.js";

startTracing();

process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]", {
    message: error.message,
    stack: error.stack,
    pid: process.pid,
  });
  void shutdownTracing().finally(() => {
    process.exit(1);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection]", {
    reason,
    promise,
    pid: process.pid,
  });
  process.exit(1);
});

process.on("SIGTERM", () => {
  void shutdownTracing().finally(() => {
    process.exit(0);
  });
});

async function start() {
  const { setupServer } = await import("./server.js");
  const fastify = await setupServer();
  const port = Number(process.env.PORT) || 8080;

  fastify.listen({ port, host: "0.0.0.0" }, function (err: Error | null) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  });
}

try {
  await start();
} catch (err) {
  console.error(err);
}
