import Fastify from "fastify";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { clientRoutes } from "./router/client.router.js";
import { apiRoutes } from "./router/api.router.js";
import { proxyRoutes } from "./router/proxy.router.js";
import logoutPlugin from "./router/logout.router.js";
import { authPlugin } from "./plugins/auth.plugin.js";
import { consentPlugin } from "./plugins/consent.plugin.js";
import opaPlugin from "./plugins/opa.plugin.js";
import { buildSessionStore, connectRedis } from "./utils/redis.js";
import tracePlugin from "./plugins/trace.plugin.js";
import { getSettings } from "./utils/settings.js";
import { watchConfig } from "./utils/configWatcher.js";

interface LoggerConfig {
  development: {
    transport: {
      target: string;
      options: {
        translateTime: string;
        ignore: string;
      };
    };
  };
  production: { level: string };
  test: { level: string };
}

export async function setupServer(): Promise<FastifyInstance> {
  const cfg = getSettings();

  const envToLogger: LoggerConfig = {
    development: {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    },
    production: {
      level: cfg.logging.level,
    },
    test: { level: "silent" },
  };

  const environment =
    (process.env.ENVIRONMENT as keyof LoggerConfig) || "production";

  // Expressed as a trust function rather than a hop count: Fastify
  // forwards a number to proxy-addr happily at runtime but does not
  // type it, and `hop < n` is the same rule written out.
  const configuredHops = cfg.security.rate_limit.trust_proxy;
  const trustProxy =
    configuredHops === false
      ? false
      : (_address: string, hop: number) => hop < Number(configuredHops);

  const serverOptions: FastifyServerOptions = {
    logger: envToLogger[environment] ?? true,
    bodyLimit: cfg.server.body_limit,
    // Behind an OpenShift Route or an ingress, the socket address is
    // the proxy's. Without this every request looks like it came from
    // one client, so the rate limiter shares a single bucket across
    // the whole deployment and the per-user limit is a per-cluster
    // limit. A hop count rather than `true`: trusting the full
    // X-Forwarded-For lets a caller prepend an address and mint a
    // fresh bucket per request.
    trustProxy,
  };

  const fastify = Fastify(serverOptions);

  // Explicitly remove information disclosure headers
  fastify.addHook('onSend', async (request, reply) => {
    reply.removeHeader('X-Powered-By');
    reply.removeHeader('Server');
  });

  await fastify.register(tracePlugin);

  await fastify.register(import("@fastify/cors"), {
    origin: process.env.CORS_ORIGIN || cfg.cors.origin,
    optionsSuccessStatus: 200,
    credentials: true,
  });
  await connectRedis();
  const store = buildSessionStore();
  if (store) {
    fastify.log.info("Using Redis-backed session store");
  } else {
    fastify.log.info("Using in-memory session store (no REDIS_HOST)");
  }

  if (cfg.security.helmet.enabled) {
    const csp = cfg.security.helmet.csp;

    // Build connect-src with agent endpoint
    const connectSrc = [...csp.connect_src];
    if (cfg.agent.endpoint) {
      try {
        const agentUrl = new URL(cfg.agent.endpoint);
        const agentOrigin = `${agentUrl.protocol}//${agentUrl.host}`;
        if (!connectSrc.includes(agentOrigin)) {
          connectSrc.push(agentOrigin);
        }
      } catch {
        fastify.log.warn('Invalid agent.endpoint URL, not added to CSP connect-src');
      }
    }

    // Same treatment for branding images. A logo hosted off-origin is
    // a perfectly ordinary thing to configure and the default
    // img-src ('self' data: blob:) blocks it silently — the browser
    // reports a CSP violation in the console and the page just shows
    // no logo, which reads as a bad URL rather than a policy.
    //
    // Derived rather than listed so the CDN host is not a second
    // place to edit: change branding.logo_url and the policy follows.
    const imgSrc = [...csp.img_src];
    for (const url of [cfg.branding.logo_url, cfg.branding.favicon_url]) {
      if (!url || url.startsWith('/') || url.startsWith('data:')) continue;
      try {
        const parsed = new URL(url);
        const origin = `${parsed.protocol}//${parsed.host}`;
        if (!imgSrc.includes(origin)) imgSrc.push(origin);
      } catch {
        fastify.log.warn(`Invalid branding image URL, not added to CSP img-src: ${url}`);
      }
    }

    await fastify.register(import("@fastify/helmet"), {
      crossOriginEmbedderPolicy: cfg.security.helmet.cross_origin_embedder_policy,
      // MCP Apps sandbox (ext-apps / sandbox_proxy.js) learns the host from
      // document.referrer. Helmet's default no-referrer breaks that handshake;
      // hostOrigin query param is the fallback, but send an origin referrer too.
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: csp.default_src,
          scriptSrc: csp.script_src,
          styleSrc: csp.style_src,
          imgSrc: imgSrc,
          connectSrc: connectSrc,
          fontSrc: csp.font_src,
          objectSrc: csp.object_src,
          frameSrc: csp.frame_src ?? ["'self'"],
          frameAncestors: csp.frame_ancestors,
        },
      },
    });
  }

  if (cfg.security.rate_limit.enabled) {
    const rl = cfg.security.rate_limit;
    const excludeSet = new Set(rl.exclude_paths);
    await fastify.register(import("@fastify/rate-limit"), {
      max: rl.max,
      timeWindow: rl.window,
      // Key on the signed-in user, falling back to IP.
      //
      // IP alone is wrong in both directions here: everyone behind one
      // corporate NAT shares a bucket and throttles each other, while
      // one person on three devices gets three. The session id is the
      // closest thing to "a person" this server has, and it cannot be
      // forged — it is signed with COOKIE_SIGN.
      keyGenerator: (request) => {
        const session = (request as { session?: { user?: { sub?: string } } }).session;
        return session?.user?.sub ?? request.ip;
      },
      allowList: (request) => {
        const path = request.url.split("?")[0];
        return excludeSet.has(path);
      },
    });
  }

  const cookieSign = process.env.COOKIE_SIGN;
  if (!cookieSign || cookieSign.length < 32) {
    throw new Error(
      "COOKIE_SIGN env var is required and must be at least 32 characters. " +
      "Set it to a cryptographically random string before starting the server."
    );
  }

  await fastify.register(import("@fastify/cookie"));
  await fastify.register(import("@fastify/session"), {
    secret: cookieSign,
    // Do not persist a session that holds nothing.
    //
    // @fastify/session defaults this to true, so every request
    // arriving without a cookie (health probes, unauthenticated API
    // calls, crawlers, a curl in a loop) wrote a session record
    // holding only a cookie object, with the full 30-day TTL.
    // Twenty anonymous requests created twenty-two keys; a dev
    // cluster reached 19,000.
    //
    // They accumulate in the same Redis the agent uses for its
    // worker queue and lease recovery, so this is a slow squeeze on
    // something that matters, not merely wasted space. A session is
    // now written when something is actually put in it, which in
    // practice means at login.
    saveUninitialized: false,
    cookie: {
      secure: cfg.security.session.secure_cookie,
      httpOnly: cfg.security.session.http_only ?? true,
      sameSite: cfg.security.session.same_site ?? 'lax',
      maxAge: 1000 * 60 * 60 * 24 * cfg.security.session.max_age_days,
      path: '/',
    },
    ...(store ? { store } : {}),
  });

  await fastify.register(consentPlugin);

  if (cfg.features.auth_enabled) {
    await fastify.register(authPlugin);
  }

  if (cfg.platform.opa.enabled) {
    await fastify.register(opaPlugin);
  }

  await fastify.register(logoutPlugin);

  await fastify.register(apiRoutes, { prefix: "/api" });
  await fastify.register(proxyRoutes, { prefix: "/api" });

  await fastify.register(clientRoutes);

  return fastify;
}

export function startConfigWatcher(configPath: string, server: FastifyInstance) {
  let cfg = getSettings();
  const cleanup = watchConfig(configPath, (newSettings) => {
    server.log.info('[ConfigWatcher] Settings reloaded');

    const restartRequired = [];
    if (newSettings.security.rate_limit.enabled !== cfg.security.rate_limit.enabled ||
        newSettings.security.rate_limit.max !== cfg.security.rate_limit.max ||
        newSettings.security.rate_limit.window !== cfg.security.rate_limit.window) {
      restartRequired.push('rate_limit (requires server restart)');
    }
    if (newSettings.security.session.max_age_days !== cfg.security.session.max_age_days ||
        newSettings.security.session.secure_cookie !== cfg.security.session.secure_cookie) {
      restartRequired.push('session (requires server restart)');
    }
    if (newSettings.security.helmet.enabled !== cfg.security.helmet.enabled) {
      restartRequired.push('helmet (requires server restart)');
    }

    if (restartRequired.length > 0) {
      server.log.warn({ settings: restartRequired }, '[ConfigWatcher] The following settings changed but require server restart:');
    }

    const autoApplied = [];
    if (newSettings.agent.timeout_ms !== cfg.agent.timeout_ms) {
      autoApplied.push(`agent.timeout_ms: ${cfg.agent.timeout_ms} → ${newSettings.agent.timeout_ms}`);
    }
    if (newSettings.agent.endpoint !== cfg.agent.endpoint) {
      autoApplied.push(`agent.endpoint: ${cfg.agent.endpoint} → ${newSettings.agent.endpoint}`);
    }
    if (JSON.stringify(newSettings.branding) !== JSON.stringify(cfg.branding)) {
      autoApplied.push('branding (colors, title, logo)');
    }

    if (autoApplied.length > 0) {
      server.log.info({ settings: autoApplied }, '[ConfigWatcher] Settings applied without restart:');
    }

    cfg = newSettings;
  });

  return cleanup;
}
