import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
  validateProductionEnv: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getJudgeMode: vi.fn(() => "docker"),
  validateProductionEnv: mocks.validateProductionEnv,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

describe("health API response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateProductionEnv.mockReturnValue({ errors: [], ok: true });
    mocks.prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
  });

  it("does not expose judge mode or environment validation errors", async () => {
    mocks.validateProductionEnv.mockReturnValue({
      errors: ["DATABASE_URL must not be relative in production"],
      ok: false,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ database: "unknown", ok: false });
    expect(body.timestamp).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("judgeMode");
    expect(body).not.toHaveProperty("errors");
  });

  it("does not expose judge mode on successful health checks", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ database: "ok", ok: true });
    expect(body.timestamp).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("judgeMode");
  });
});
