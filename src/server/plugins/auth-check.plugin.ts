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
      const dummyUser = {
        accessToken: "access-token",
        expiresAt: "2026-10-29T23:20:00.417Z",
        cn: "John Wick",
        displayName: "John",
        email: "johnwick@redhat.com",
        email_verified: false,
        family_name: "Wick",
        givenName: "John",
        given_name: "John",
        mail: "johnwick@redhat.com",
        name: "John Wick",
        preferred_username: "johnwick",
        rhatUUID: "asdsadsad-e194-11ef-a0f1-safdsfds",
        sn: "Wick",
        sub: "1sdsd1ef7-7e0c-4c45-a250-dssdsd"
      };

      request.session.user = dummyUser;
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
