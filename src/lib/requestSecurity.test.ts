import { describe, expect, it } from "vitest";
import { isSameOriginMutationRequest } from "./requestSecurity";

describe("isSameOriginMutationRequest", () => {
  it("allows safe read methods without origin headers", () => {
    const request = new Request("http://oj.local/api/problems", {
      method: "GET",
    });

    expect(isSameOriginMutationRequest(request)).toBe(true);
  });

  it("allows same-origin mutation requests", () => {
    const request = new Request("http://oj.local/api/problems/1/submit", {
      headers: { Origin: "http://oj.local" },
      method: "POST",
    });

    expect(isSameOriginMutationRequest(request)).toBe(true);
  });

  it("rejects cross-origin mutation requests", () => {
    const request = new Request("http://oj.local/api/admin/settings", {
      headers: { Origin: "https://evil.example" },
      method: "PUT",
    });

    expect(isSameOriginMutationRequest(request)).toBe(false);
  });

  it("uses forwarded proto and host when the app is behind a proxy", () => {
    const request = new Request("http://127.0.0.1:3000/api/admin/settings", {
      headers: {
        Host: "127.0.0.1:3000",
        Origin: "https://oj.example.com",
        "X-Forwarded-Host": "oj.example.com",
        "X-Forwarded-Proto": "https",
      },
      method: "PUT",
    });

    expect(isSameOriginMutationRequest(request)).toBe(true);
  });
});
