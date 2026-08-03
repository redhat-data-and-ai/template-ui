import oauthPlugin from "@fastify/oauth2";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { getSettings } from "../utils/settings.js";

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
  const cfg = getSettings();

  await fastify.register(import("@fastify/rate-limit"), {
    max: 20,
    timeWindow: "1 minute",
  });

  fastify.register(oauthPlugin as any, {
    name: "redhatSSO",
    scope: ["profile", "email", "session:role-any"],
    credentials: {
      client: {
        id: cfg.auth.sso_client_id,
        secret: cfg.auth.sso_client_secret,
      },
    },
    callbackUri: cfg.auth.sso_callback_url,
    discovery: {
      issuer: cfg.auth.sso_issuer_host,
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
    if (!token) {
      return reply.code(401).send({ message: "NoSession" });
    }
    try {
      const { forceRefresh = "false" } = (request as any).query;
      if (forceRefresh === "true") {
        throw new Error("FORCE_REFRESH");
      }

      await fastify.redhatSSO.userinfo(token.access_token);

      return reply.send({ message: "ValidToken" });
    } catch {
      try {
        const newAccessToken =
          await fastify.redhatSSO.getNewAccessTokenUsingRefreshToken(token, {});

        (request as any).session.token = newAccessToken.token;

        return reply.send({
          message: "RefreshedToken",
          token: newAccessToken.token,
        });
      } catch (refreshError) {
        fastify.log.error({ err: refreshError }, 'Token refresh failed');
        return reply.code(401).send({ message: "RefreshFailed" });
      }
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

export const authPlugin = fp(routes, { name: "auth-plugin" });
