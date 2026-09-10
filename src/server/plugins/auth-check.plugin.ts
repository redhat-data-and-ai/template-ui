import fastifyPlugin from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSettings } from "../utils/settings.js";
import { resolveRole, type UserRole } from "../utils/role-resolver.js";

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
    role?: UserRole;
    roleResolvedAt?: number;
    consentApproved?: boolean;
    consentGrantedAt?: string;
    postConsentRedirect?: string;
  }
}
function headerValue(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function buildGatewayLoginUrl(request: FastifyRequest): string {
  const basePath = (process.env.BASE_PATH || "").replace(/\/+$/, "");
  const redirectPath = `${basePath}${request.url}` || "/";
  return `/login?redirect=${encodeURIComponent(redirectPath)}`;
}

function shouldSkipAuth(request: FastifyRequest): boolean {
  const path = request.url.split("?")[0];
  return (
    path === "/_health" ||
    path.startsWith("/auth/") ||
    path.startsWith("/dist/") ||
    path === "/favicon.ico" ||
    path === "/login" ||
    path === "/consent" ||
    path === "/api/health/agent" ||
    path === "/sandbox_proxy.html" ||
    path === "/sandbox_proxy.js"
  );
}

async function authCheck(
  instance: FastifyInstance,
  _options: Record<string, unknown>,
) {
  const rl = getSettings().security.rate_limit;
  if (rl.enabled) {
    await instance.register(import("@fastify/rate-limit"), {
      max: rl.max,
      timeWindow: rl.window,
    });
  }

  instance.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (shouldSkipAuth(request)) {
      return;
    }

    if (process.env.AUTH_ENABLED === "false") {
      const gwEmail = headerValue(request, "x-auth-user-email");
      const gwName = headerValue(request, "x-auth-user-name");
      const gwSub = headerValue(request, "x-auth-user-sub");
      const gwToken = headerValue(request, "x-auth-access-token") || headerValue(request, "x-token");

      if (gwEmail) {
        request.session.user = {
          email: gwEmail,
          email_verified: true,
          family_name: gwName?.split(" ").pop() || "",
          given_name: gwName?.split(" ")[0] || "",
          name: gwName || gwEmail,
          preferred_username: gwEmail.split("@")[0],
          sub: gwSub || gwEmail,
        };
      } else {
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

      if (gwToken) {
        request.session.token = {
          access_token: gwToken,
          expires_at: Date.now() + 3600_000,
          id_token: "",
          refresh_token: "",
          scope: "openid",
        };
      }

      request.session.role = "owners";

      if (!request.session.consentApproved) {
        request.session.consentApproved = true;
        request.session.consentGrantedAt = new Date().toISOString();
      }
    }

    if (!request.session?.user) {
      request.session.redirectUri = request.url;
      return reply.redirect(buildGatewayLoginUrl(request));
    }

    if (process.env.AUTH_ENABLED !== "false") {
      const cacheTtl = parseInt(process.env.LDAP_CACHE_TTL_SECONDS || "300", 10) * 1000;
      const needsResolve =
        request.session.role === undefined ||
        !request.session.roleResolvedAt ||
        Date.now() - request.session.roleResolvedAt > cacheTtl;

      if (needsResolve) {
        try {
          request.session.role = await resolveRole(
            request.session.user.preferred_username || request.session.user.email || request.session.user.sub,
          );
          request.session.roleResolvedAt = Date.now();
        } catch (err) {
          console.error("[AuthCheck] Role resolution failed:", (err as Error).message);
          request.session.role = "denied";
        }
      }

      const role = request.session.role;
      const path = request.url.split("?")[0];

      if (role === "denied" || role == null) {
        return reply.code(403).send({
          error: "access_denied",
          message: "You are not authorized to access this application.",
        });
      }

      if (
        role === "users" &&
        (path.startsWith("/api/proxy/agent/evals") || path === "/eval/dataset")
      ) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Insufficient permissions for this resource.",
        });
      }
    }

    if (!request.session.consentApproved) {
      const path = request.url.split("?")[0];
      if (path !== "/consent") {
        if (path.startsWith("/api/") || path.startsWith("/v1/")) {
          return reply.code(403).send({ error: "consent_required", message: "User consent is required" });
        }
        request.session.postConsentRedirect = request.url;
        return reply.redirect("/consent");
      }
    }
  });
}

export default fastifyPlugin(authCheck);
