import { describe, expect, it } from "vitest";
import { can, resolveProjectAccess } from "@/server/authorization/policy";

describe("authorization policy", () => {
  it("maps org roles to access levels", () => {
    expect(resolveProjectAccess("OWNER", null)).toBe("FULL");
    expect(resolveProjectAccess("MANAGER", null)).toBe("FULL");
    expect(resolveProjectAccess("EDITOR", null)).toBe("REVIEW");
    expect(resolveProjectAccess("ACTOR", null)).toBe("NONE");
    expect(resolveProjectAccess(null, "MANAGER")).toBe("NONE");
  });
  it("lets project membership elevate but never below org level", () => {
    expect(resolveProjectAccess("ACTOR", "ACTOR")).toBe("ACTOR");
    expect(resolveProjectAccess("ACTOR", "EDITOR")).toBe("REVIEW");
    expect(resolveProjectAccess("EDITOR", "MANAGER")).toBe("FULL");
    expect(resolveProjectAccess("OWNER", "ACTOR")).toBe("FULL");
  });
  it("encodes the permissions matrix", () => {
    expect(can.manageProviderCredentials("OWNER")).toBe(true);
    expect(can.manageProviderCredentials("MANAGER")).toBe(false);
    expect(can.createProject("MANAGER")).toBe(true);
    expect(can.createProject("EDITOR")).toBe(false);
    expect(can.review("REVIEW")).toBe(true);
    expect(can.review("ACTOR")).toBe(false);
    expect(can.generateAi("ACTOR")).toBe(false);
    expect(can.upload("ACTOR")).toBe(true);
    expect(can.assign("REVIEW")).toBe(false);
  });
});
