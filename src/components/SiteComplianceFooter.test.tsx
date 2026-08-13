import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteComplianceFooter } from "@/components/SiteComplianceFooter";

const officialIcon =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJklEQVQ4jWOQ8ur6T03MMGrg/9Ew/D+abP6P5pT/o4XD/xFYHgIAm2kCfq3CV6UAAAAASUVORK5CYII=";

describe("SiteComplianceFooter", () => {
  it("renders an ICP-only footer with the fixed official lookup URL", () => {
    const html = renderToStaticMarkup(
      <SiteComplianceFooter
        settings={{
          icpRecordNumber: "陕ICP备2026021441号-1",
          publicSecurityRecordIcon: "",
          publicSecurityRecordNumber: "",
        }}
      />,
    );

    expect(html).toContain("data-site-compliance-footer");
    expect(html).toContain("flex-wrap");
    expect(html).toContain("https://beian.miit.gov.cn/");
    expect(html).toContain("陕ICP备2026021441号-1");
    expect(html).not.toContain("公网安备");
  });

  it("renders the official icon and derived police lookup link", () => {
    const html = renderToStaticMarkup(
      <SiteComplianceFooter
        settings={{
          icpRecordNumber: "陕ICP备2026021441号-1",
          publicSecurityRecordIcon: officialIcon,
          publicSecurityRecordNumber: "陕公网安备61011302001964号",
        }}
      />,
    );

    expect(html).toContain("陕公网安备61011302001964号");
    expect(html).toContain(
      "https://beian.mps.gov.cn/#/query/webSearch?code=61011302001964",
    );
    expect(html).toContain("data:image/png;base64,");
  });

  it("renders nothing for empty public settings and a teaching empty state in preview", () => {
    const settings = {
      icpRecordNumber: "",
      publicSecurityRecordIcon: "",
      publicSecurityRecordNumber: "",
    };
    expect(renderToStaticMarkup(<SiteComplianceFooter settings={settings} />)).toBe(
      "",
    );
    expect(
      renderToStaticMarkup(<SiteComplianceFooter preview settings={settings} />),
    ).toContain("填写有效备案信息后");
  });
});
