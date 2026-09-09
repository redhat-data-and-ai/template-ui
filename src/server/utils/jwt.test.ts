import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRole } from "./jwt.js";

describe("resolveRole", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.RESTRICT_TO_GROUPS;
    delete process.env.DEVELOPER_GROUP;
    delete process.env.USER_GROUP;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("grants developer when both groups are empty", () => {
    process.env.DEVELOPER_GROUP = "";
    process.env.USER_GROUP = "";

    expect(resolveRole({ realm_access: { roles: ["anyone"] } })).toBe("developer");
  });

  it("grants developer when groups are whitespace-only", () => {
    process.env.DEVELOPER_GROUP = "  ";
    process.env.USER_GROUP = "\t";

    expect(resolveRole({ realm_access: { roles: ["anyone"] } })).toBe("developer");
  });

  it("grants developer when only DEVELOPER_GROUP is set and JWT is in it", () => {
    process.env.DEVELOPER_GROUP = "lightspeed-developer";
    process.env.USER_GROUP = "";

    expect(
      resolveRole({ realm_access: { roles: ["lightspeed-developer"] } }),
    ).toBe("developer");
  });

  it("denies when only DEVELOPER_GROUP is set and JWT is not in it", () => {
    process.env.DEVELOPER_GROUP = "lightspeed-developer";
    process.env.USER_GROUP = "";

    expect(resolveRole({ realm_access: { roles: ["anyone"] } })).toBe("denied");
  });

  it("grants viewer when only USER_GROUP is set and JWT is in it", () => {
    process.env.DEVELOPER_GROUP = "";
    process.env.USER_GROUP = "lightspeed-user";

    expect(resolveRole({ realm_access: { roles: ["lightspeed-user"] } })).toBe(
      "viewer",
    );
  });

  it("denies when only USER_GROUP is set and JWT is not in it", () => {
    process.env.DEVELOPER_GROUP = "";
    process.env.USER_GROUP = "lightspeed-user";

    expect(resolveRole({ realm_access: { roles: ["anyone"] } })).toBe("denied");
  });

  it("grants developer when JWT has DEVELOPER_GROUP", () => {
    process.env.DEVELOPER_GROUP = "lightspeed-developer";
    process.env.USER_GROUP = "lightspeed-user";

    expect(
      resolveRole({ realm_access: { roles: ["lightspeed-developer"] } }),
    ).toBe("developer");
  });

  it("grants viewer when JWT has USER_GROUP only", () => {
    process.env.DEVELOPER_GROUP = "lightspeed-developer";
    process.env.USER_GROUP = "lightspeed-user";

    expect(resolveRole({ realm_access: { roles: ["lightspeed-user"] } })).toBe(
      "viewer",
    );
  });

  it("prefers developer when JWT has both groups", () => {
    process.env.DEVELOPER_GROUP = "lightspeed-developer";
    process.env.USER_GROUP = "lightspeed-user";

    expect(
      resolveRole({
        realm_access: { roles: ["lightspeed-user", "lightspeed-developer"] },
      }),
    ).toBe("developer");
  });

  it("denies when both groups are set and JWT has neither", () => {
    process.env.DEVELOPER_GROUP = "lightspeed-developer";
    process.env.USER_GROUP = "lightspeed-user";

    expect(resolveRole({ realm_access: { roles: ["other-role"] } })).toBe(
      "denied",
    );
  });

  it("grants developer when DEVELOPER_GROUP is a comma-separated list and JWT matches one", () => {
    process.env.DEVELOPER_GROUP = "admin, lightspeed-developer, super-dev";
    process.env.USER_GROUP = "lightspeed-user";

    expect(
      resolveRole({ realm_access: { roles: ["lightspeed-developer"] } }),
    ).toBe("developer");
  });

  it("grants viewer when USER_GROUP is a comma-separated list and JWT matches one", () => {
    process.env.DEVELOPER_GROUP = "lightspeed-developer";
    process.env.USER_GROUP = "lightspeed-user, basic-user, guest";

    expect(
      resolveRole({ realm_access: { roles: ["guest"] } }),
    ).toBe("viewer");
  });

  it("denies when JWT matches none of the comma-separated groups", () => {
    process.env.DEVELOPER_GROUP = "admin, lightspeed-developer";
    process.env.USER_GROUP = "lightspeed-user, basic-user";

    expect(resolveRole({ realm_access: { roles: ["other-role"] } })).toBe(
      "denied",
    );
  });

  it("prefers developer when JWT matches groups in both lists", () => {
    process.env.DEVELOPER_GROUP = "admin, lightspeed-developer";
    process.env.USER_GROUP = "lightspeed-user, admin";

    expect(
      resolveRole({ realm_access: { roles: ["admin"] } }),
    ).toBe("developer");
  });
});
