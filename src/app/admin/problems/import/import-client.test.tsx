import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ImportClient } from "./import-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("ImportClient", () => {
  it("allows selecting multiple Markdown files and explains per-problem labels", () => {
    const html = renderToStaticMarkup(<ImportClient />);

    expect(html).toContain("选择多个 .md");
    expect(html).toContain("一次最多选择 20 个文档");
    expect(html).toContain("每道题会按自己的题型、难度和分类生成标签");
    expect(html).toMatch(/<input[^>]*multiple=""[^>]*type="file"/);
  });
});
