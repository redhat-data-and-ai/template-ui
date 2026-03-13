import fastifyPlugin from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface Session {
    user?: {
      email: string;
      email_verified: boolean;
      family_name: string;
      given_name: string;
      name: string;
      preferred_username: string;
      sub: string;
    };
    token?: {
      access_token: string;
      expires_at: number;
      id_token: string;
      refresh_token: string;
      scope: string;
    };
    redirectUri?: string;
  }
}

function authCheck(
  instance: FastifyInstance,
  _options: Record<string, unknown>,
  done: (err?: Error) => void
) {
  instance.addHook("preHandler", (request: FastifyRequest, reply: FastifyReply, next: () => void) => {
    if (process.env.AUTH_ENABLED === "false") {
      request.session.user = {
        email: "developer@example.com",
        email_verified: true,
        family_name: "Developer",
        given_name: "Local",
        name: "Local Developer",
        preferred_username: "local-dev",
        sub: "dev-local-00000000-0000-0000-0000-000000000000",
      };

      request.session.token = {
        access_token: "dev-access-token",
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        id_token: "dev-id-token",
        refresh_token: "dev-refresh-token",
        scope: "openid profile email",
      };
    }

    if (!request.session?.user) {
      request.session.redirectUri = request.url;
      reply.redirect("/login");
    } else {
      next();
    }
  });
  done();
}

export default fastifyPlugin(authCheck);
