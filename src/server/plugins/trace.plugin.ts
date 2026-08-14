import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const TRACEPARENT_RE =
  /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i;

declare module "fastify" {
  interface FastifyRequest {
    traceId: string;
    requestId: string;
  }
}

const tracePlugin: FastifyPluginAsync = async function tracePlugin(fastify) {
  fastify.addHook("onRequest", async (request) => {
    const tp = request.headers.traceparent;
    let traceId: string | undefined;
    if (typeof tp === "string") {
      const m = TRACEPARENT_RE.exec(tp.trim());
      if (m) traceId = m[1].toLowerCase();
    }
    if (!traceId) {
      const xt = request.headers["x-trace-id"];
      traceId =
        typeof xt === "string" && /^[\w.-]{1,64}$/.test(xt) ? xt : randomUUID();
    }
    request.headers["x-trace-id"] = traceId;

    request.traceId = traceId;
    request.requestId = randomUUID();
  });

  fastify.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Trace-ID", request.traceId);
    reply.header("X-Request-ID", request.requestId);
    return payload;
  });
};

export default fp(tracePlugin, { name: "trace" });
