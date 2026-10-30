import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { handleHistoryGet, handleStreamPost } from "../controllers/v1/agent.js";
import { getSettings } from "../utils/settings.js";
import authCheckPlugin from "../plugins/auth-check.plugin.js";
import { toClientUserData } from "../utils/session-identity.js";

interface StreamRequest {
  message: string;
  thread_id: string;
  session_id: string;
  user_id: string;
}

async function apiRoutes(fastify: FastifyInstance) {
  // Public routes — no auth required
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  fastify.get("/version", async () => {
    return {
      version: process.env.APP_VERSION || "0.0.0",
      buildHash: process.env.BUILD_HASH || "dev",
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      environment: process.env.ENVIRONMENT || "production",
    };
  });

  fastify.get("/announcement", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async () => {
    const cfg = getSettings();
    const envMessage = process.env.ANNOUNCEMENT_MESSAGE;
    const message = envMessage || cfg.announcement.message;
    const enabled = envMessage ? true : cfg.announcement.enabled;
    if (!enabled || !message) return { enabled: false };
    return {
      enabled: true,
      message,
      type: process.env.ANNOUNCEMENT_TYPE || cfg.announcement.type,
    };
  });

  fastify.get("/config/branding", async (_request, reply) => {
    const cfg = getSettings();
    reply.header("Cache-Control", "no-store");
    return cfg.branding;
  });

  fastify.get("/config/features", async (_request, reply) => {
    const cfg = getSettings();
    reply.header("Cache-Control", "no-store");
    return cfg.features;
  });

  fastify.get("/config/compliance", async (_request, reply) => {
    if (!fastify.hasDecorator("opa")) {
      return { enabled: false, violations: [] };
    }
    const violations = fastify.opa.evaluate();
    reply.header("Cache-Control", "no-store");
    return {
      enabled: true,
      loaded: fastify.opa.engine.isLoaded(),
      violations,
      compliant: violations.length === 0,
    };
  });

  fastify.get("/config/agent-structure", async (_request, reply) => {
    const cfg = getSettings();
    const agentHost = cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";

    try {
      const response = await fetch(`${agentHost}/config/agent-structure`, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        return reply.code(response.status).send({
          error: "Unable to load agent structure",
        });
      }

      reply.header("Cache-Control", "no-store");
      return response.json();
    } catch {
      return reply.code(502).send({ error: "Unable to reach agent" });
    }
  });

  // Vite local serves HTML without session injection. Keep this off auth-check
  // so a missing cookie returns 401 JSON instead of a /login redirect (429s SSO).
  fastify.get("/me", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store");
    if (request.session?.user) {
      return {
        ...toClientUserData(request.session),
        userRole: request.session.role ?? null,
      };
    }
    if (process.env.AUTH_ENABLED === "false") {
      return {
        ...toClientUserData({
          user: {
            preferred_username: "imrankhan",
            name: "Imran Khan",
            displayName: "Imran",
            email: "imrankhan@redhat.com",
          },
        }),
        userRole: null,
      };
    }
    return reply.code(401).send({ error: "unauthenticated" });
  });

  // Serve page images from the Pathfinder outputs directory
  fastify.get("/pages/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const urlPath = (request.params as Record<string, string>)["*"] ?? "";
    const decodedPath = decodeURIComponent(urlPath);

    const PAGES_BASE = "/Users/imrankhan/Documents/PersonalProject/nemoExtract/outputs-pathfinder";
    const fullPath = `${PAGES_BASE}/${decodedPath}`;

    if (!fullPath.startsWith(PAGES_BASE) || fullPath.includes("..")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    try {
      const data = await readFile(fullPath);
      const ext = extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
      };
      reply.header("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.send(data);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
  });

  // Serve crop images from the Pathfinder data directory
  fastify.get("/crops/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const urlPath = (request.params as Record<string, string>)["*"] ?? "";
    const decodedPath = decodeURIComponent(urlPath);

    // Only allow serving from the nemoExtract data/crops directory
    const CROPS_BASE = "/Users/imrankhan/Documents/PersonalProject/nemoExtract/data/crops";
    const fullPath = `${CROPS_BASE}/${decodedPath}`;

    // Prevent path traversal
    if (!fullPath.startsWith(CROPS_BASE) || fullPath.includes("..")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    try {
      const data = await readFile(fullPath);
      const ext = extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
      };
      reply.header("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.send(data);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
  });

  // Citation validation endpoint — calls MCP server directly
  fastify.post("/validate-citations", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { citations?: Array<{ doc_title: string; page: number }> } | null;
    const citations = body?.citations;
    if (!Array.isArray(citations) || citations.length === 0) {
      return reply.code(400).send({ error: "citations array required" });
    }

    const MCP_URL = process.env.MCP_URL || "http://localhost:5003/mcp";

    try {
      // Initialize MCP session
      const initResp = await fetch(MCP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "initialize",
          params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "bff-validator", version: "1.0" } },
        }),
      });
      const initText = await initResp.text();
      const sessionId = initResp.headers.get("mcp-session-id") ?? "";

      // Call validate_citations
      const toolResp = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 2, method: "tools/call",
          params: { name: "validate_citations", arguments: { citations } },
        }),
      });
      const toolText = await toolResp.text();

      // Parse SSE response
      const lines = toolText.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = JSON.parse(line.slice(6));
          const content = payload?.result?.content;
          if (Array.isArray(content) && content[0]?.type === "text") {
            return reply.send(JSON.parse(content[0].text));
          }
        }
      }
      return reply.code(502).send({ error: "Invalid MCP response" });
    } catch (err) {
      return reply.code(502).send({ error: "MCP server unreachable" });
    }
  });

  // Protected routes — auth required
  await fastify.register(async (protectedRoutes) => {
    await protectedRoutes.register(authCheckPlugin);

    protectedRoutes.post("/v1/stream", async (request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) => {
      return handleStreamPost(protectedRoutes, request, reply);
    });

    protectedRoutes.get("/v1/history/:threadId", async (request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) => {
      return handleHistoryGet(protectedRoutes, request, reply);
    });
  });
}

export { apiRoutes };
