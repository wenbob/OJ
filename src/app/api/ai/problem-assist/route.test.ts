import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAiAssistAdviceCache } from "@/lib/aiAssistCache";
import { clearAiAssistCooldowns } from "@/lib/aiAssistRateLimit";
import { requestDeepSeekAdvice } from "@/lib/aiAssist";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    user: { id: 1, username: "student", role: "student" },
    response: null,
  })),
}));

vi.mock("@/lib/aiAssist", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aiAssist")>(
    "@/lib/aiAssist",
  );
  return {
    ...actual,
    requestDeepSeekAdvice: vi.fn(async () => "先考虑边界，再处理输入输出。"),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    problem: {
      findUnique: vi.fn(async () => ({
        id: 10,
        title: "A+B",
        description: "求和",
        inputDescription: "两个整数",
        outputDescription: "和",
        dataRange: "0 <= a,b <= 100",
        problemType: "programming",
        testCases: [{ input: "1 2", output: "3" }],
      })),
    },
    systemSetting: {
      findUnique: vi.fn(async () => ({ value: "true" })),
    },
    exam: {
      findUnique: vi.fn(async () => null),
    },
    examRecord: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

function request(body: unknown) {
  return new Request("http://oj.local/api/ai/problem-assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/problem-assist", () => {
  beforeEach(() => {
    clearAiAssistAdviceCache();
    clearAiAssistCooldowns();
    vi.clearAllMocks();
  });

  it("returns AI advice when practice AI is enabled", async () => {
    const response = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.advice).toContain("边界");
  });

  it("does not return cached advice when the practice AI switch is disabled", async () => {
    vi.mocked(requestDeepSeekAdvice).mockResolvedValueOnce(
      "题目分析：这是一条已缓存的思路。",
    );

    const first = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    await first.json();
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValueOnce({
      value: "false",
    } as never);

    const response = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("日常练习 AI 已关闭");
    expect(requestDeepSeekAdvice).toHaveBeenCalledTimes(1);
  });

  it("rejects objective problems at the API layer", async () => {
    vi.mocked(prisma.problem.findUnique).mockResolvedValueOnce({
      id: 10,
      title: "选择题",
      description: "选出正确答案",
      inputDescription: "",
      outputDescription: "",
      dataRange: null,
      problemType: "objective",
      testCases: [],
    } as never);

    const response = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("AI 助手暂只支持编程题");
    expect(requestDeepSeekAdvice).not.toHaveBeenCalled();
  });

  it("returns cached valid advice for the same problem within five minutes", async () => {
    vi.mocked(requestDeepSeekAdvice).mockResolvedValueOnce(
      "题目分析：先看清输入。\n解题步骤：第一步，读入数字。",
    );

    const first = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const firstBody = await first.json();
    const second = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(firstBody.cached).toBe(false);
    expect(second.status).toBe(200);
    expect(secondBody.cached).toBe(true);
    expect(secondBody.advice).toBe(firstBody.advice);
    expect(requestDeepSeekAdvice).toHaveBeenCalledTimes(1);
  });

  it("enforces cooldown when no valid cached advice exists", async () => {
    await POST(request({ problemId: 10, mode: "hint", code: "" }) as never);
    clearAiAssistAdviceCache();
    const response = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("retries empty AI advice once and only caches the valid retry", async () => {
    vi.mocked(requestDeepSeekAdvice)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("题目分析：这次返回了正常思路。");

    const response = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const body = await response.json();
    const cachedResponse = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const cachedBody = await cachedResponse.json();

    expect(response.status).toBe(200);
    expect(body.advice).toContain("正常思路");
    expect(body.cached).toBe(false);
    expect(cachedResponse.status).toBe(200);
    expect(cachedBody.cached).toBe(true);
    expect(cachedBody.advice).toBe(body.advice);
    expect(requestDeepSeekAdvice).toHaveBeenCalledTimes(2);
  });

  it("does not retry provider rate-limit errors immediately", async () => {
    vi.mocked(requestDeepSeekAdvice).mockRejectedValueOnce(
      new Error("AI 服务请求失败：429"),
    );

    const response = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("AI 服务正忙，请稍后再试。");
    expect(requestDeepSeekAdvice).toHaveBeenCalledTimes(1);
  });

  it("does not leak internal configuration names to students", async () => {
    vi.mocked(requestDeepSeekAdvice).mockRejectedValueOnce(
      new Error("AI 服务未配置，请管理员设置 DEEPSEEK_API_KEY"),
    );

    const response = await POST(
      request({ problemId: 10, mode: "hint", code: "" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("AI 服务暂未配置，请联系老师。");
    expect(body.error).not.toContain("DEEPSEEK_API_KEY");
  });

  it("rejects removed debug mode", async () => {
    const response = await POST(
      request({ problemId: 10, mode: "debug", code: "int main(){}" }) as never,
    );

    expect(response.status).toBe(400);
  });
});
