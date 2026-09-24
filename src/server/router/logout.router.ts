import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";

const SESSION_COOKIE_NAME = "sessionId";

async function logoutRoutes(fastify: FastifyInstance) {
  fastify.post("/auth/logout", async (request, reply) => {
    const secure = process.env.ENVIRONMENT === "production";
    const baseClear = {
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
    };

    reply.clearCookie("access_token", { ...baseClear, maxAge: 0 });
    reply.clearCookie("refresh_token", { ...baseClear, maxAge: 0 });
    reply.clearCookie(SESSION_COOKIE_NAME, { ...baseClear, maxAge: 0 });

    await new Promise<void>((resolve, reject) => {
      request.session.destroy((err) => {
        if (err) reject(err);
        else resolve();
      });
    }).catch((err: unknown) => {
      fastify.log.warn({ err }, "Session destroy failed during logout");
    });

    return reply.send({ success: true });
  });
}

export default fp(logoutRoutes, {
  name: "logout-router",
});
