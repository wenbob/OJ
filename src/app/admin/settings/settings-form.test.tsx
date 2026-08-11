import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AiProviderAdminStatuses } from "@/lib/aiProvider";
import { defaultSystemSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const statuses: AiProviderAdminStatuses = {
  programming: {
    baseUrl: "https://api.deepseek.com",
    credentialConfigured: true,
    customThinkingProtocol: "none",
    legacyFallback: false,
    model: "deepseek-v4-pro",
    provider: "deepseek",
    thinkingMode: "enabled",
  },
  objective: {
    baseUrl: "https://api.deepseek.com",
    credentialConfigured: true,
    customThinkingProtocol: "none",
    legacyFallback: false,
    model: "deepseek-v4-pro",
    provider: "deepseek",
    thinkingMode: "enabled",
  },
};

describe("administrator AI prompt settings", () => {
  it("renders four programming editors and one objective editor with reset controls", () => {
    const html = renderToStaticMarkup(
      <SettingsForm
        initialAiProviderStatuses={statuses}
        initialRevision="revision-1"
        initialSettings={defaultSystemSettings}
      />,
    );

    expect(html).toContain("自定义教学提示词");
    expect(html).toContain("理解题目");
    expect(html).toContain("下一步提示");
    expect(html).toContain("检查代码");
    expect(html).toContain("自由提问");
    expect(html).toContain("题目解析");
    expect(html.match(/恢复默认或修改内容/g)).toHaveLength(5);
    expect(html).toContain(defaultSystemSettings.aiProgrammingOverviewPrompt);
    expect(html).toContain(defaultSystemSettings.aiObjectiveExplanationPrompt);
  });
});
