import oauthPlugin from "@fastify/oauth2";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { getSettings } from "../utils/settings.js";
import { resolveSessionIdentity, safePostLoginRedirect } from "../utils/session-identity.js";

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

/** Auth-only limiter: this plugin is wrapped with fp(), so global:true would apply app-wide. */
const AUTH_ROUTE_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: "1 minute",
    },
  },
} as const;

async function routes(fastify: FastifyInstance) {
  const cfg = getSettings();

  // Opt-in per route — do not use global:true (fp breaks encapsulation).
  await fastify.register(import("@fastify/rate-limit"), {
    global: false,
    max: 20,
    timeWindow: "1 minute",
  });

  fastify.register(oauthPlugin as any, {
    name: "redhatSSO",
    scope: ["openid", "profile", "email", "session:role-any", "offline_access"],
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

  fastify.get("/login", AUTH_ROUTE_RATE_LIMIT, (request, reply) => {
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

  fastify.get("/auth/refresh-token", AUTH_ROUTE_RATE_LIMIT, async (request, reply) => {
    const token = (request as any).session.token;

    const newAccessToken =
      await fastify.redhatSSO.getNewAccessTokenUsingRefreshToken(token, {});

    (request as any).session.token = newAccessToken.token;

    return reply.send(newAccessToken);
  });

  fastify.get("/auth/refresh", AUTH_ROUTE_RATE_LIMIT, async (request, reply) => {
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

  fastify.get("/auth/callback/oidc", AUTH_ROUTE_RATE_LIMIT, async function (request, reply) {
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
        defaultRedirect = safePostLoginRedirect(redirectUri);
      } catch (error) {
        console.error(error);
      }

      const identity = resolveSessionIdentity({
        user: userInfo,
        token: tokenSet.token,
      });
      (request as any).session.user = identity.user;
      (request as any).session.token = tokenSet.token;

      return reply.redirect(defaultRedirect);
    } catch (error) {
      console.error(error);
      return reply.send({ message: "Some error occured!" });
    }
  });
}

export const authPlugin = fp(routes, { name: "auth-plugin" });
