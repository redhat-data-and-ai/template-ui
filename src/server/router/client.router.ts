import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import authCheckPlugin from "../plugins/auth-check.plugin.js";
import { getAgentName, getSettings } from "../utils/settings.js";
import { toClientUserData } from "../utils/session-identity.js";
import {
  buildSandboxCspHeader,
  parseCspQueryParam,
  SANDBOX_JS_CSP,
} from "../utils/mcp-apps-csp.js";

const BUILD_VERSION = Date.now().toString(36);
const basePath = (process.env.BASE_PATH || "").replace(/\/+$/, "");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

async function readSandboxAsset(filename: string): Promise<string> {
  const candidates = [
    path.join(__dirname, "../static", filename),
    path.join(process.cwd(), "src/server/static", filename),
    path.join(process.cwd(), "dist/server/static", filename),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf-8");
    } catch {
      // try next
    }
  }
  throw new Error(`MCP Apps sandbox asset not found: ${filename}`);
}

function sandboxPathOnly(url: string): string {
  return url.split("?")[0] ?? url;
}

async function routes(fastify: FastifyInstance) {
  await fastify.register(authCheckPlugin);

  await fastify.register(import("@fastify/static"), {
    root: path.join(process.cwd(), "dist/frontend"),
    prefix: "/dist/frontend",
    decorateReply: false,
  });

  await fastify.register(import("@fastify/url-data"));

  // Override global helmet CSP for sandbox assets. Helmet also sets CSP; browsers
  // enforce every Content-Security-Policy header (intersection), so a leftover
  // helmet `base-uri 'self'` would block allowlisted baseUriDomains.
  fastify.addHook("onSend", async (request, reply, payload) => {
    const pathOnly = sandboxPathOnly(request.url);
    if (pathOnly === "/sandbox_proxy.js") {
      reply.header("Content-Security-Policy", SANDBOX_JS_CSP);
      return payload;
    }
    if (pathOnly === "/sandbox_proxy.html") {
      reply.header("X-Frame-Options", "SAMEORIGIN");
      const cspParam = (request.query as { csp?: string }).csp;
      reply.header(
        "Content-Security-Policy",
        buildSandboxCspHeader(parseCspQueryParam(cspParam)),
      );
      return payload;
    }
    return payload;
  });

  fastify.get("/_health", (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send("OK");
  });

  fastify.get("/sandbox_proxy.html", async (request, reply) => {
    const cfg = getSettings();
    if (!cfg.features.mcp_apps_enabled) {
      return reply.code(404).send("MCP Apps sandbox is disabled");
    }
    const cspParam = (request.query as { csp?: string }).csp;
    const cspConfig = parseCspQueryParam(cspParam);
    const html = await readSandboxAsset("sandbox_proxy.html");
    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", buildSandboxCspHeader(cspConfig))
      .send(html);
  });

  fastify.get("/sandbox_proxy.js", async (_request, reply) => {
    const cfg = getSettings();
    if (!cfg.features.mcp_apps_enabled) {
      return reply.code(404).send("MCP Apps sandbox is disabled");
    }
    const js = await readSandboxAsset("sandbox_proxy.js");
    return reply
      .type("application/javascript; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(js);
  });

  fastify.get("/auth/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const redirect =
      typeof (request.query as { redirect?: string }).redirect === "string"
        ? (request.query as { redirect: string }).redirect
        : "/";
    request.session.redirectUri = redirect;
    return reply.redirect("/login");
  })
  
  fastify.get("/mcp/oauth/callback", async (request: FastifyRequest, reply: FastifyReply) => {
    const cfg = getSettings();
    const agentHost = cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";
    const qs = request.url.split("?")[1] || "";
    const agentUrl = `${agentHost}/mcp/oauth/callback${qs ? `?${qs}` : ""}`;
    const resp = await fetch(agentUrl, {
      headers: { cookie: request.headers.cookie || "" },
    });
    reply
      .status(resp.status)
      .type(resp.headers.get("content-type") || "text/html");
    return reply.send(await resp.text());
  });

  fastify.get("/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.session;
    const userData = toClientUserData(session);
    const sessionToken =
      userData.accessToken ||
      headerValue(request, "x-auth-access-token") ||
      headerValue(request, "x-token");
    userData.accessToken = sessionToken || "";

    const agentName = await getAgentName();
    const cfg = getSettings();
    const appData = {
      apiUrl: basePath ? `${basePath}/api/proxy/agent` : "",
      basePath: basePath || "/",
      refreshableToken: "",
      agentName,
      branding: cfg.branding,
      features: cfg.features,
    };

    reply.type("text/html");
    return reply.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" id="favicon" href="/favicon.ico" />
    <title>${escapeHtml(agentName)}</title>
    <link rel="stylesheet" href="${basePath || ""}/dist/frontend/template-ui.css">
    <style>
    /* PF6/Tailwind v4 co-existence: inline to bypass Vite CSS purging */
    .pf-v6-c-button{--pf-v6-c-button--AlignItems:center}
    .pf-v6-c-button__text{display:inline-flex!important;align-items:center;gap:.375rem}
    .pf-v6-c-button.pf-m-block{--pf-v6-c-button--Display:flex;width:100%}
    .pf-v6-c-masthead.pf-v6-c-masthead{display:flex!important;align-items:center;gap:0}
    .pf-v6-c-masthead__toggle,.pf-v6-c-masthead__main{display:flex;align-items:center}
    .pf-v6-c-masthead__content{flex:1 1 auto;display:flex;align-items:center;justify-content:flex-end}
    .pf-v6-c-page{height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;overflow:hidden}
    .pf-v6-c-page__main-container{align-self:stretch!important;display:flex;flex-direction:column;overflow:hidden}
    .pf-v6-c-page__main{flex:1 1 0%;min-height:0;display:flex;flex-direction:column;overflow:hidden}
    </style>
</head>
<body>
    <div id="root" data-user="${encodeURIComponent(JSON.stringify(userData || {}))}" data-app="${encodeURIComponent(JSON.stringify(appData))}"></div>
    <script src="${basePath || ""}/dist/frontend/main.umd.js?v=${BUILD_VERSION}"></script>
</body>
</html>`);
  });
}

export { routes as clientRoutes };
