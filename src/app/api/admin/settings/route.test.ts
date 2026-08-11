import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import { defaultSystemSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { PUT } from "./route";

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    user: { id: 1, username: "admin", role: "admin" },
    response: null,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: (() => {
    const systemSetting = {
      create: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => ({ value: "revision-1" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      upsert: vi.fn(async () => ({})),
    };
    return {
      $transaction: vi.fn(
        async (callback: (tx: { systemSetting: typeof systemSetting }) => unknown) =>
          callback({ systemSetting }),
      ),
      systemSetting,
    };
  })(),
}));

const pngIcon = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64")}`;

function request(
  settings: unknown,
  contentLength?: number,
  revision = "revision-1",
) {
  return new Request("http://oj.local/api/admin/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    },
    body: JSON.stringify({ revision, settings }),
  });
}

describe("PUT /api/admin/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValue({
      value: "revision-1",
    } as never);
    vi.mocked(prisma.systemSetting.updateMany).mockResolvedValue({
      count: 1,
    } as never);
  });

  it("stores a validated browser title and PNG icon", async () => {
    const response = await PUT(request({
      ...defaultSystemSettings,
      browserTitle: "好好练题",
      browserIcon: pngIcon,
    }) as never);
    expect(response.status).toBe(200);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { key: "browserTitle", value: "好好练题" },
      }),
    );
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { key: "browserIcon", value: pngIcon },
      }),
    );
  });

  it("rejects icon content disguised as PNG", async () => {
    const response = await PUT(request({
      ...defaultSystemSettings,
      browserIcon: "data:image/png;base64,SGVsbG8=",
    }) as never);
    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects settings requests above the dedicated limit", async () => {
    const response = await PUT(request(defaultSystemSettings, 512 * 1024 + 1) as never);
    expect(response.status).toBe(413);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a stale administrator snapshot without overwriting settings", async () => {
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValueOnce({
      value: "revision-2",
    } as never);

    const response = await PUT(
      request(defaultSystemSettings, undefined, "revision-1") as never,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("其他页面更新");
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it("rejects legacy full-form writes that do not carry a revision", async () => {
    const response = await PUT(
      new Request("http://oj.local/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaultSystemSettings),
      }) as never,
    );

    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "权限不足" }), { status: 403 }) as never,
    });
    const response = await PUT(request(defaultSystemSettings) as never);
    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("overrides official-provider Base URLs on the server", async () => {
    const response = await PUT(
      request({
        ...defaultSystemSettings,
        aiBaseUrl: "https://attacker.invalid/v1",
        aiModel: "doubao-chat",
        aiProvider: "doubao",
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          key: "aiBaseUrl",
          value: "https://ark.cn-beijing.volces.com/api/v3",
        },
      }),
    );
  });

  it("normalizes and persists the objective profile independently", async () => {
    const response = await PUT(
      request({
        ...defaultSystemSettings,
        aiObjectiveBaseUrl: "https://attacker.invalid/v1",
        aiObjectiveModel: "objective-chat",
        aiObjectiveProvider: "doubao",
        aiObjectiveThinkingMode: "disabled",
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          key: "aiObjectiveBaseUrl",
          value: "https://ark.cn-beijing.volces.com/api/v3",
        },
      }),
    );
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { key: "aiObjectiveModel", value: "objective-chat" },
      }),
    );
  });

  it("normalizes and persists all administrator AI prompts atomically", async () => {
    const response = await PUT(
      request({
        ...defaultSystemSettings,
        aiProgrammingOverviewPrompt: "  用生活场景解释\r\n每次三步  ",
        aiProgrammingNextStepPrompt: "每次只问一个问题",
        aiProgrammingCodeReviewPrompt: "先肯定，再指出问题",
        aiProgrammingQuestionPrompt: "只回答当前问题",
        aiObjectiveExplanationPrompt: "逐项用简单中文解释",
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          key: "aiProgrammingOverviewPrompt",
          value: "用生活场景解释\n每次三步",
        },
      }),
    );
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          key: "aiObjectiveExplanationPrompt",
          value: "逐项用简单中文解释",
        },
      }),
    );
  });

  it("rejects an invalid AI prompt before writing any settings", async () => {
    const response = await PUT(
      request({
        ...defaultSystemSettings,
        aiProgrammingQuestionPrompt: "  ",
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects private custom Base URLs before persisting settings", async () => {
    const response = await PUT(
      request({
        ...defaultSystemSettings,
        aiBaseUrl: "https://10.0.0.8/v1",
        aiModel: "custom-chat",
        aiProvider: "custom",
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an unsafe objective custom URL atomically", async () => {
    const response = await PUT(
      request({
        ...defaultSystemSettings,
        aiObjectiveBaseUrl: "https://10.0.0.9/v1",
        aiObjectiveModel: "objective-chat",
        aiObjectiveProvider: "custom",
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("never includes an environment API key in the response", async () => {
    const original = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "server-only-test-secret";
    try {
      const response = await PUT(request(defaultSystemSettings) as never);
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).not.toContain("server-only-test-secret");
      expect(body).not.toContain("apiKey");
      expect(body).toContain("credentialConfigured");
    } finally {
      if (original === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = original;
      }
    }
  });
});
