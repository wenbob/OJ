import { describe, expect, it } from "vitest";
import {
  PayloadTooLargeError,
  ensureTextWithinByteLimit,
  readJsonWithLimit,
} from "./requestLimits";

describe("request size limits", () => {
  it("rejects text that exceeds the byte limit", () => {
    expect(() => ensureTextWithinByteLimit("abcdef", 5, "代码")).toThrow(
      PayloadTooLargeError,
    );
  });

  it("rejects JSON requests whose content-length exceeds the limit", async () => {
    const request = new Request("http://oj.local/api/auth/login", {
      body: JSON.stringify({ username: "alice" }),
      headers: {
        "Content-Length": "1024",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    await expect(readJsonWithLimit(request, 10)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it("parses JSON when the request is within the limit", async () => {
    const request = new Request("http://oj.local/api/auth/login", {
      body: JSON.stringify({ username: "alice" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      username: "alice",
    });
  });
});
