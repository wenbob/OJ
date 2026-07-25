import { describe, expect, it } from "vitest";
import { createAiAssistAdviceCacheKey } from "./aiAssistCache";

describe("AI assist cache key", () => {
  it("keeps identical prompts stable and isolates provider configurations", () => {
    const input = {
      mode: "overview" as const,
      problemId: 12,
      prompt: "题目资料",
    };
    const first = createAiAssistAdviceCacheKey({
      ...input,
      providerFingerprint: "provider-a",
    });

    expect(
      createAiAssistAdviceCacheKey({
        ...input,
        providerFingerprint: "provider-a",
      }),
    ).toBe(first);
    expect(
      createAiAssistAdviceCacheKey({
        ...input,
        providerFingerprint: "provider-b",
      }),
    ).not.toBe(first);
  });
});
