import oauthPlugin from "@fastify/oauth2";
import { FastifyInstance } from "fastify";

const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID;
const SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET;
const SSO_ISSUER_HOST = process.env.SSO_ISSUER_HOST;
const SSO_CALLBACK_URL = process.env.SSO_CALLBACK_URL;

import { OAuth2Namespace } from "@fastify/oauth2";

type UserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  family_name: string;
  given_name: string;
  name: string;
  preferred_username: string;
};

declare module "fastify" {
  interface FastifyInstance {
    redhatSSO: OAuth2Namespace;
  }
}

async function routes(fastify: FastifyInstance) {
  fastify.register(oauthPlugin as any, {
    name: "redhatSSO",
    scope: ["profile", "email", "session:role-any"],
    credentials: {
      client: {
        id: SSO_CLIENT_ID,
        secret: SSO_CLIENT_SECRET,
      },
    },
    callbackUri: SSO_CALLBACK_URL,
    discovery: {
      issuer: SSO_ISSUER_HOST,
    },
  });

  fastify.get("/login", (request, reply) => {
    fastify.redhatSSO.generateAuthorizationUri(
      request,
      reply,
      (err, authorizationEndpoint) => {
        if (err) {
          console.error(err);
          return reply.send(500);
        }

        reply.redirect(authorizationEndpoint);
      }
    );
  });

  fastify.get("/auth/refresh-token", async (request, reply) => {
    const token = (request as any).session.token;

    const newAccessToken =
      await fastify.redhatSSO.getNewAccessTokenUsingRefreshToken(token, {});

    (request as any).session.token = newAccessToken.token;

    return reply.send(newAccessToken);
  });

  fastify.get("/auth/refresh", async (request, reply) => {
    const token = (request as any).session.token;
    try {
      const { forceRefresh = "false" } = (request as any).query;
      if (forceRefresh === "true") {
        throw new Error("FORCE_REFRESH");
      }

      await fastify.redhatSSO.userinfo(token.access_token);

      return reply.send({ message: "ValidToken" });
    } catch (error: unknown) {
      console.error(error);

      const newAccessToken =
        await fastify.redhatSSO.getNewAccessTokenUsingRefreshToken(token, {});

      (request as any).session.token = newAccessToken.token;

      return reply.send({
        message: "RefreshedToken",
        token: newAccessToken.token,
      });
    }
  });

  fastify.get("/auth/callback/oidc", async function (request, reply) {
    try {
      const tokenSet =
        await fastify.redhatSSO.getAccessTokenFromAuthorizationCodeFlow(
          request,
          reply
        );

      const userInfo = (await fastify.redhatSSO.userinfo(
        tokenSet.token.access_token
      )) as unknown as UserInfo;

      let defaultRedirect = "/";
      try {
        const { redirectUri = "/" } = (request as any).session;
        defaultRedirect = redirectUri;
      } catch (error) {
        console.error(error);
      }

      (request as any).session.user = userInfo;
      (request as any).session.token = tokenSet.token;

      return reply.redirect(defaultRedirect);
    } catch (error) {
      console.error(error);
      return reply.send({ message: "Some error occured!" });
    }
  });
}

export { routes as authPlugin };
