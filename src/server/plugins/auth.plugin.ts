import oauthPlugin from "@fastify/oauth2";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
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

/**
 * Reject cross-origin POST requests that lack a same-origin Origin header.
 */
function verifyCsrfOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const allowed = new URL(`${request.protocol}://${request.hostname}`).origin;
    if (new URL(origin).origin !== allowed) {
      reply.code(403).send({ error: "cross_origin_denied", message: "Cross-origin request rejected" });
      return false;
    }
  } catch {
    reply.code(403).send({ error: "invalid_origin", message: "Invalid Origin header" });
    return false;
  }
  return true;
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

      const previousSub = (request as any).session.user?.sub;
      (request as any).session.user = identity.user;
      (request as any).session.token = tokenSet.token;

      if (previousSub && previousSub !== identity.user.sub) {
        (request as any).session.consentApproved = false;
        delete (request as any).session.consentGrantedAt;
      }

      if ((request as any).session.consentApproved) {
        return reply.redirect(defaultRedirect);
      }

      (request as any).session.postConsentRedirect = defaultRedirect;
      return reply.redirect("/consent");
    } catch (error) {
      console.error(error);
      return reply.send({ message: "Some error occured!" });
    }
  });

  fastify.post("/auth/consent/approve", AUTH_ROUTE_RATE_LIMIT, async (request, reply) => {
    if (!verifyCsrfOrigin(request, reply)) return;
    const session = (request as any).session;
    if (!session?.user) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    session.consentApproved = true;
    session.consentGrantedAt = new Date().toISOString();

    const redirectUrl = session.postConsentRedirect ?? "/";
    delete session.postConsentRedirect;

    return reply.send({ message: "Consent approved", redirectUrl });
  });

  fastify.get("/auth/consent/status", AUTH_ROUTE_RATE_LIMIT, async (request, reply) => {
    const session = (request as any).session;
    return reply.send({
      hasConsent: !!session?.consentApproved,
      grantedAt: session?.consentGrantedAt ?? null,
    });
  });

  fastify.post("/auth/consent/revoke", AUTH_ROUTE_RATE_LIMIT, async (request, reply) => {
    if (!verifyCsrfOrigin(request, reply)) return;
    const session = (request as any).session;
    if (!session?.user) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    session.consentApproved = false;
    delete session.consentGrantedAt;

    return reply.send({ message: "Consent revoked" });
  });
}

export const authPlugin = fp(routes, { name: "auth-plugin" });
