import * as path from "node:path";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import authCheckPlugin from "../plugins/auth-check.plugin.js";
import { getAgentName } from "../utils/config.js";

const BUILD_VERSION = Date.now().toString(36);
const basePath = (process.env.BASE_PATH || "").replace(/\/+$/, "");

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

async function routes(fastify: FastifyInstance) {
  await fastify.register(authCheckPlugin);

  await fastify.register(import("@fastify/static"), {
    root: path.join(process.cwd(), "dist/frontend"),
    prefix: "/dist/frontend",
    decorateReply: false,
  });

  await fastify.register(import("@fastify/url-data"));

  fastify.get("/_health", (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send("OK");
  });

  fastify.get("/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.session;
    const { user, token } = session;

    const sessionToken = token?.access_token || headerValue(request, "x-auth-access-token") || headerValue(request, "x-token");

    const userData = {
      ...user,
      accessToken: sessionToken,
      expiresAt: token?.expires_at,
    };

    const agentName = await getAgentName();
    const appData = {
      apiUrl: basePath ? `${basePath}/api/proxy/agent` : "",
      basePath: basePath || "/",
      refreshableToken: "",
      agentName,
    };

    reply.type("text/html");
    reply.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${agentName}</title>
    <link rel="stylesheet" href="${basePath}/dist/frontend/template-ui.css">
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
    <div id="root"></div>
    <script>
    window.USER_DATA = ${JSON.stringify(userData || {})}
    window.APP_DATA = ${JSON.stringify(appData)}
    </script>
    <script src="${basePath}/dist/frontend/main.umd.js?v=${BUILD_VERSION}"></script>
</body>
</html>`);
  });
}

export { routes as clientRoutes };
