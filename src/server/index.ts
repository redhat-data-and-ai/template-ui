process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]", {
    message: error.message,
    stack: error.stack,
    pid: process.pid,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection]", {
    reason,
    promise,
    pid: process.pid,
  });
  process.exit(1);
});

import { setupServer } from "./server.js";

async function start() {
  const fastify = await setupServer();
  const port = Number(process.env.PORT) || 8080;

  fastify.listen({ port, host: "0.0.0.0" }, function (err: Error | null) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  });
}

start().catch(console.error);
