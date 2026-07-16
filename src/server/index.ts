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
  const { setupServer, startConfigWatcher } = await import("./server.js");
  const fastify = await setupServer();
  const port = Number(process.env.PORT) || 8080;

  // Start config watcher for hot reload
  // UI_CONFIG_PATH is set by deployer via ConfigMap mount, defaults to local path
  const configPath = process.env.UI_CONFIG_PATH || "config/ui/settings.yaml";
  try {
    const stopWatcher = startConfigWatcher(configPath, fastify);
    console.log(`[Server] Config watcher started on ${configPath}`);

    // Cleanup watcher on shutdown
    process.on("SIGTERM", () => {
      console.log("[Server] Shutting down config watcher");
      stopWatcher();
    });
  } catch (error) {
    console.warn(`[Server] Could not start config watcher on ${configPath}:`, error);
    console.warn(`[Server] Config hot reload disabled`);
  }

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
