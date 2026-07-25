import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import { AiProviderError, listAvailableAiModels } from "@/lib/aiProvider";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    response: null,
    user: { id: 1, role: "admin", username: "admin" },
  })),
}));

vi.mock("@/lib/aiProvider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aiProvider")>(
    "@/lib/aiProvider",
  );
  return {
    ...actual,
    listAvailableAiModels: vi.fn(),
  };
});

function request(body: unknown) {
  return new Request("http://oj.local/api/admin/ai-provider/models", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/admin/ai-provider/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAvailableAiModels).mockResolvedValue([
      { id: "model-2", ownedBy: "vendor" },
      { id: "model-10", ownedBy: "vendor" },
    ]);
  });

  it("returns a safe model list to administrators", async () => {
    const response = await POST(
      request({
        baseUrl: "https://api.deepseek.com",
        provider: "deepseek",
      }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toHaveLength(2);
    expect(body).not.toHaveProperty("apiKey");
  });

  it("rejects non-admin callers before contacting the provider", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "权限不足" }), {
        status: 403,
      }) as never,
      user: null,
    });

    const response = await POST(
      request({ baseUrl: "", provider: "deepseek" }) as never,
    );
    expect(response.status).toBe(403);
    expect(listAvailableAiModels).not.toHaveBeenCalled();
  });

  it("rejects unknown providers", async () => {
    const response = await POST(
      request({ baseUrl: "https://example.com/v1", provider: "unknown" }) as never,
    );
    expect(response.status).toBe(400);
    expect(listAvailableAiModels).not.toHaveBeenCalled();
  });

  it("returns 409 for an unconfigured credential without exposing secrets", async () => {
    vi.mocked(listAvailableAiModels).mockRejectedValueOnce(
      new AiProviderError(
        "missing-credential",
        "当前 AI 服务商尚未配置服务器密钥",
      ),
    );
    const response = await POST(
      request({ baseUrl: "", provider: "doubao" }) as never,
    );
    const bodyText = await response.text();

    expect(response.status).toBe(409);
    expect(bodyText).toContain("尚未配置服务器密钥");
    expect(bodyText).not.toContain("ARK_API_KEY");
  });

  it("maps timeout and unsafe custom targets to stable status codes", async () => {
    vi.mocked(listAvailableAiModels).mockRejectedValueOnce(
      new AiProviderError("timeout", "AI 服务请求超时"),
    );
    const timeoutResponse = await POST(
      request({ baseUrl: "", provider: "deepseek" }) as never,
    );
    expect(timeoutResponse.status).toBe(504);

    vi.mocked(listAvailableAiModels).mockRejectedValueOnce(
      new AiProviderError(
        "unsafe-target",
        "AI 服务地址不能指向本机、内网或保留网络",
      ),
    );
    const unsafeResponse = await POST(
      request({
        baseUrl: "https://127.0.0.1/v1",
        provider: "custom",
      }) as never,
    );
    expect(unsafeResponse.status).toBe(400);
  });
});
