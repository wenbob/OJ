import { describe, expect, it, vi } from "vitest";
import { defaultSystemSettings, getSetting } from "@/lib/settings";
import {
  getAiCooldownDefinition,
  getAiCooldownSeconds,
  resolveAiCooldownSeconds,
} from "./aiRuntimeSettings";

vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>(
    "@/lib/settings",
  );
  return {
    ...actual,
    getSetting: vi.fn(),
  };
});

describe("AI runtime cooldown settings", () => {
  it("maps only the supported role and profile combinations", () => {
    expect(getAiCooldownDefinition("programming", "student")).toMatchObject({
      fallback: 20,
      key: "aiProgrammingStudentCooldownSeconds",
    });
    expect(getAiCooldownDefinition("objective", "teacher")).toMatchObject({
      fallback: 30,
      key: "aiObjectiveTeacherCooldownSeconds",
    });
    expect(getAiCooldownDefinition("objective", "student")).toMatchObject({
      fallback: 30,
      key: "aiObjectiveStudentCooldownSeconds",
    });
  });

  it("uses configured values and safely falls back for invalid stored data", async () => {
    vi.mocked(getSetting)
      .mockResolvedValueOnce("7")
      .mockResolvedValueOnce("invalid");

    await expect(
      getAiCooldownSeconds("programming", "student"),
    ).resolves.toBe(7);
    await expect(
      getAiCooldownSeconds("objective", "admin"),
    ).resolves.toBe(30);
    expect(getSetting).toHaveBeenNthCalledWith(
      1,
      "aiProgrammingStudentCooldownSeconds",
    );
  });

  it("resolves the full settings snapshot for all objective roles", () => {
    const settings = {
      ...defaultSystemSettings,
      aiObjectiveAdminCooldownSeconds: "600",
      aiProgrammingTeacherCooldownSeconds: "5",
    };

    expect(
      resolveAiCooldownSeconds(settings, "programming", "teacher"),
    ).toBe(5);
    expect(resolveAiCooldownSeconds(settings, "objective", "admin")).toBe(600);
    expect(resolveAiCooldownSeconds(settings, "objective", "student")).toBe(30);
  });
});
