import * as path from "node:path";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import authCheckPlugin from "../plugins/auth-check.plugin.js";

const appData = {
  apiUrl: "", // Empty — frontend uses relative /api/proxy/agent/* paths via BFF
  refreshableToken: "",
};

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

  fastify.get("/*", (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.session;
    const { user, token } = session;

    const userData = {
      ...user,
      accessToken: token?.access_token,
      expiresAt: token?.expires_at,
    };

    reply.type("text/html");
    reply.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Template UI</title>
    <link rel="stylesheet" href="/dist/frontend/template-ui.css">
</head>
<body>
    <div id="root"></div>
    <script>
    window.USER_DATA = ${JSON.stringify(userData || {})}
    window.APP_DATA = ${JSON.stringify(appData)}
    </script>
    <script src="/dist/frontend/main.umd.js"></script>
</body>
</html>`);
  });
}

export { routes as clientRoutes };
