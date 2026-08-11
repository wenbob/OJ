import { describe, expect, it } from "vitest";
import { validateAccountPassword } from "./password";

describe("account password validation", () => {
  it("rejects passwords that bcrypt would silently truncate after 72 UTF-8 bytes", () => {
    expect(validateAccountPassword("密".repeat(25))).toContain("72 字节");
    expect(validateAccountPassword("a".repeat(72))).toBeNull();
  });
});
