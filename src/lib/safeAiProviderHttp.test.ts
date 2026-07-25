import http from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  isPublicAiProviderAddress,
  normalizeAiProviderBaseUrl,
  requestSafeAiProviderHttp,
  resolveSafeAiProviderTarget,
  SafeAiProviderHttpError,
} from "./safeAiProviderHttp";

async function startLocalServer(
  handler: http.RequestListener,
): Promise<{ baseUrl: string; server: http.Server }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("本地测试服务器启动失败");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
}

async function closeLocalServer(server: http.Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("safe AI provider address validation", () => {
  it("accepts public addresses and rejects private, loopback, metadata and reserved ranges", () => {
    expect(isPublicAiProviderAddress("8.8.8.8")).toBe(true);
    expect(isPublicAiProviderAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicAiProviderAddress("127.0.0.1")).toBe(false);
    expect(isPublicAiProviderAddress("10.0.0.1")).toBe(false);
    expect(isPublicAiProviderAddress("169.254.169.254")).toBe(false);
    expect(isPublicAiProviderAddress("192.168.1.1")).toBe(false);
    expect(isPublicAiProviderAddress("::1")).toBe(false);
    expect(isPublicAiProviderAddress("fc00::1")).toBe(false);
    expect(isPublicAiProviderAddress("fe80::1")).toBe(false);
    expect(isPublicAiProviderAddress("2001:db8::1")).toBe(false);
  });

  it("rejects URL credentials, query parameters, fragments and production HTTP", () => {
    expect(() =>
      normalizeAiProviderBaseUrl("https://user:pass@example.com/v1", {
        allowLocalDevelopment: false,
      }),
    ).toThrow("不能包含凭据");
    expect(() =>
      normalizeAiProviderBaseUrl("https://example.com/v1?token=x", {
        allowLocalDevelopment: false,
      }),
    ).toThrow("查询参数");
    expect(() =>
      normalizeAiProviderBaseUrl("https://example.com/v1#models", {
        allowLocalDevelopment: false,
      }),
    ).toThrow("片段");
    expect(() =>
      normalizeAiProviderBaseUrl("http://example.com/v1", {
        allowLocalDevelopment: false,
      }),
    ).toThrow("公共 HTTPS");
  });

  it("allows HTTP loopback only in development", async () => {
    await expect(
      resolveSafeAiProviderTarget("http://localhost:8080/v1", {
        allowLocalDevelopment: true,
        lookup: vi.fn(async () => [
          { address: "127.0.0.1", family: 4 as const },
        ]) as never,
      }),
    ).resolves.toMatchObject({
      target: { address: "127.0.0.1", family: 4 },
    });
    await expect(
      resolveSafeAiProviderTarget("http://localhost:8080/v1", {
        allowLocalDevelopment: false,
      }),
    ).rejects.toMatchObject({ kind: "invalid-url" });
  });

  it("rejects domains when any DNS answer is private", async () => {
    await expect(
      resolveSafeAiProviderTarget("https://models.example.test/v1", {
        allowLocalDevelopment: false,
        lookup: vi.fn(async () => [
          { address: "8.8.8.8", family: 4 as const },
          { address: "10.0.0.5", family: 4 as const },
        ]) as never,
      }),
    ).rejects.toMatchObject({ kind: "unsafe-target" });
  });

  it("allows the local Codex proxy range only when a fixed official endpoint opts in", async () => {
    const proxyLookup = vi.fn(async () => [
      { address: "198.18.0.184", family: 4 as const },
    ]) as never;

    await expect(
      resolveSafeAiProviderTarget("https://api.deepseek.com/models", {
        allowDevelopmentNetworkProxy: true,
        allowLocalDevelopment: true,
        lookup: proxyLookup,
      }),
    ).resolves.toMatchObject({
      target: { address: "198.18.0.184", family: 4 },
    });
    await expect(
      resolveSafeAiProviderTarget("https://custom.example.test/models", {
        allowDevelopmentNetworkProxy: false,
        allowLocalDevelopment: true,
        lookup: proxyLookup,
      }),
    ).rejects.toMatchObject({ kind: "unsafe-target" });
  });
});

describe("safe AI provider HTTP client", () => {
  it("does not follow upstream redirects", async () => {
    let targetHit = false;
    const { baseUrl, server } = await startLocalServer((request, response) => {
      if (request.url === "/target") {
        targetHit = true;
        response.end("unexpected");
        return;
      }
      response.statusCode = 302;
      response.setHeader("Location", `${baseUrl}/target`);
      response.end("redirect");
    });

    try {
      const result = await requestSafeAiProviderHttp({
        allowLocalDevelopment: true,
        maxResponseBytes: 1024,
        method: "GET",
        timeoutMs: 1_000,
        url: `${baseUrl}/models`,
      });
      expect(result.status).toBe(302);
      expect(result.body).toBe("redirect");
      expect(targetHit).toBe(false);
    } finally {
      await closeLocalServer(server);
    }
  });

  it("stops reading responses above the configured byte limit", async () => {
    const { baseUrl, server } = await startLocalServer((_request, response) => {
      response.end("0123456789");
    });

    try {
      await expect(
        requestSafeAiProviderHttp({
          allowLocalDevelopment: true,
          maxResponseBytes: 4,
          method: "GET",
          timeoutMs: 1_000,
          url: `${baseUrl}/models`,
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<SafeAiProviderHttpError>>({
          kind: "response-too-large",
        }),
      );
    } finally {
      await closeLocalServer(server);
    }
  });

  it("aborts an upstream request after its timeout", async () => {
    const { baseUrl, server } = await startLocalServer(() => {
      // Keep the socket open so the client timeout path is exercised.
    });

    try {
      await expect(
        requestSafeAiProviderHttp({
          allowLocalDevelopment: true,
          maxResponseBytes: 1024,
          method: "GET",
          timeoutMs: 50,
          url: `${baseUrl}/models`,
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<SafeAiProviderHttpError>>({
          kind: "timeout",
        }),
      );
    } finally {
      await closeLocalServer(server);
    }
  });
});
