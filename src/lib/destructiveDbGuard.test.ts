import { describe, expect, it } from "vitest";
import { validateDestructiveDbOperation } from "./destructiveDbGuard";

describe("validateDestructiveDbOperation", () => {
  it("blocks destructive database operations against the production database", () => {
    expect(
      validateDestructiveDbOperation({
        DATABASE_URL: "file:/www/oj/prisma/prod.db",
        NODE_ENV: "production",
      }).ok,
    ).toBe(false);
  });

  it("allows local development databases", () => {
    expect(
      validateDestructiveDbOperation({
        DATABASE_URL: "file:./dev.db",
        NODE_ENV: "development",
      }).ok,
    ).toBe(true);
  });

  it("requires an exact explicit override for production-like targets", () => {
    expect(
      validateDestructiveDbOperation({
        ALLOW_DESTRUCTIVE_DB_INIT: "I_UNDERSTAND_THIS_WILL_DELETE_OJ_DATA",
        DATABASE_URL: "file:/www/oj/prisma/prod.db",
        NODE_ENV: "production",
      }).ok,
    ).toBe(true);
  });
});
