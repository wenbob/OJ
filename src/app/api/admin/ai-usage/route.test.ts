import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import { getAiUsageDashboard } from "@/lib/aiUsage";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    user: { id: 1, username: "admin", role: "admin" },
    response: null,
  })),
}));

vi.mock("@/lib/aiUsage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aiUsage")>("@/lib/aiUsage");
  return {
    ...actual,
    getAiUsageDashboard: vi.fn(async () => ({ summary: { usageCount: 3 }, rows: [] })),
  };
});

describe("GET /api/admin/ai-usage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns filtered AI usage for administrators", async () => {
    const response = await GET(
      new Request("http://oj.local/api/admin/ai-usage?window=7d&mode=question") as never,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ summary: { usageCount: 3 } });
    expect(getAiUsageDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ window: "7d", mode: "question" }),
    );
  });

  it("rejects non-admin callers", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "权限不足" }), { status: 403 }) as never,
    });
    const response = await GET(new Request("http://oj.local/api/admin/ai-usage") as never);
    expect(response.status).toBe(403);
    expect(getAiUsageDashboard).not.toHaveBeenCalled();
  });
});
