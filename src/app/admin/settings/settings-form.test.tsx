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
const publicSecurityPngIcon =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJklEQVQ4jWOQ8ur6T03MMGrg/9Ew/D+abP6P5pT/o4XD/xFYHgIAm2kCfq3CV6UAAAAASUVORK5CYII=";

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

  it("renders structured compliance controls and a live footer preview", () => {
    const html = renderToStaticMarkup(
      <SettingsForm
        initialAiProviderStatuses={statuses}
        initialRevision="revision-1"
        initialSettings={{
          ...defaultSystemSettings,
          icpRecordNumber: "陕ICP备2026021441号-1",
          publicSecurityRecordIcon: publicSecurityPngIcon,
          publicSecurityRecordNumber: "陕公网安备61011302001964号",
        }}
      />,
    );

    expect(html).toContain("备案信息");
    expect(html).toContain("ICP备案号");
    expect(html).toContain("公安备案号");
    expect(html).toContain("全站页脚预览");
    expect(html).toContain("data-site-compliance-preview=\"true\"");
    expect(html).toContain("陕ICP备2026021441号-1");
    expect(html).toContain("陕公网安备61011302001964号");
  });
});
