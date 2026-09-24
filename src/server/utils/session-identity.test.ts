import { describe, expect, it } from "vitest";
import {
  decodeJwtPayload,
  resolveSessionIdentity,
  resolveXUserIdFromSession,
  safePostLoginRedirect,
  toClientUserData,
} from "./session-identity.js";

function unsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

describe("decodeJwtPayload", () => {
  it("reads claims from an unsigned JWT", () => {
    const token = unsignedJwt({ preferred_username: "dpundir", email: "dpundir@redhat.com" });
    expect(decodeJwtPayload(token)).toMatchObject({
      preferred_username: "dpundir",
      email: "dpundir@redhat.com",
    });
  });

  it("returns null for garbage", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });
});

describe("resolveSessionIdentity", () => {
  it("fills preferred_username from the access token when userinfo omits it", () => {
    const token = unsignedJwt({
      preferred_username: "dpundir",
      email: "dpundir@redhat.com",
      name: "Darshika Pundir",
      sub: "11111111-1111-4111-8111-111111111111",
    });
    const id = resolveSessionIdentity({
      user: { sub: "11111111-1111-4111-8111-111111111111", email: "dpundir@redhat.com" },
      token: { access_token: token },
    });
    expect(id.preferred_username).toBe("dpundir");
    expect(id.displayName).toBe("Darshika Pundir");
    expect(resolveXUserIdFromSession({
      user: { sub: "11111111-1111-4111-8111-111111111111", email: "dpundir@redhat.com" },
      token: { access_token: token },
    })).toBe("dpundir");
  });

  it("falls back to the email local-part when no username claim exists", () => {
    const id = resolveSessionIdentity({
      user: { email: "dpundir@redhat.com", name: "Darshika Pundir" },
    });
    expect(id.preferred_username).toBe("dpundir");
    expect(id.displayName).toBe("Darshika Pundir");
  });

  it("falls back to JWT sub for X-User-ID when nothing else is present", () => {
    expect(
      resolveXUserIdFromSession({
        user: { sub: "11111111-1111-4111-8111-111111111111" },
      }),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("returns default when the session is empty", () => {
    expect(resolveXUserIdFromSession(undefined)).toBe("default");
    expect(resolveSessionIdentity(undefined).displayName).toBe("User");
  });

  it("includes accessToken in client user data without inventing a username from empty session", () => {
    const data = toClientUserData({
      user: { name: "Darshika Pundir", email: "dpundir@redhat.com" },
      token: { access_token: "tok", expires_at: 1_800_000_000 },
    });
    expect(data.preferred_username).toBe("dpundir");
    expect(data.accessToken).toBe("tok");
    expect(data.expiresAt).toMatch(/^\d{4}-/);
  });

  it("formats Date expires_at from the SSO token object", () => {
    const data = toClientUserData({
      user: { preferred_username: "dpundir" },
      token: { access_token: "tok", expires_at: new Date("2026-09-08T12:00:00.000Z") },
    });
    expect(data.expiresAt).toBe("2026-09-08T12:00:00.000Z");
  });
});

describe("safePostLoginRedirect", () => {
  it("keeps in-app paths", () => {
    expect(safePostLoginRedirect("/settings")).toBe("/settings");
    expect(safePostLoginRedirect("/chat/abc")).toBe("/chat/abc");
  });

  it("rejects API and auth URLs so SSO does not land on JSON", () => {
    expect(
      safePostLoginRedirect(
        "/api/proxy/agent/threads/00000000-0000-4000-8000-000000000001/state",
      ),
    ).toBe("/");
    expect(safePostLoginRedirect("/auth/callback/oidc")).toBe("/");
    expect(safePostLoginRedirect("https://evil.example")).toBe("/");
  });
});
