import { describe, expect, it } from "vitest";
import {
  ICP_RECORD_LOOKUP_URL,
  extractPublicSecurityRecordCode,
  publicSecurityRecordLookupUrl,
  resolveSiteComplianceDisplay,
  validateIcpRecordNumber,
  validatePublicSecurityRecordNumber,
} from "@/lib/siteCompliance";

const officialIcon =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJklEQVQ4jWOQ8ur6T03MMGrg/9Ew/D+abP6P5pT/o4XD/xFYHgIAm2kCfq3CV6UAAAAASUVORK5CYII=";

describe("site compliance settings", () => {
  it("accepts the current ICP record and trims surrounding whitespace", () => {
    expect(validateIcpRecordNumber("陕ICP备2026021441号-1")).toBe("");
    expect(
      resolveSiteComplianceDisplay({
        icpRecordNumber: "  陕ICP备2026021441号-1  ",
        publicSecurityRecordIcon: "",
        publicSecurityRecordNumber: "",
      }).icpRecordNumber,
    ).toBe("陕ICP备2026021441号-1");
    expect(ICP_RECORD_LOOKUP_URL).toBe("https://beian.miit.gov.cn/");
  });

  it("rejects malformed ICP and public-security record numbers", () => {
    expect(validateIcpRecordNumber("<script>alert(1)</script>")).toContain(
      "格式不正确",
    );
    expect(validatePublicSecurityRecordNumber("陕公网安备123号")).toContain(
      "格式不正确",
    );
  });

  it("extracts the 14-digit public-security code into the fixed official URL", () => {
    const recordNumber = "陕公网安备61011302001964号";
    expect(extractPublicSecurityRecordCode(recordNumber)).toBe("61011302001964");
    expect(publicSecurityRecordLookupUrl(recordNumber)).toBe(
      "https://beian.mps.gov.cn/#/query/webSearch?code=61011302001964",
    );
  });

  it("shows the public-security record only when number and PNG icon are both present", () => {
    expect(
      resolveSiteComplianceDisplay({
        icpRecordNumber: "",
        publicSecurityRecordIcon: "",
        publicSecurityRecordNumber: "陕公网安备61011302001964号",
      }).publicSecurityRecordNumber,
    ).toBe("");
    expect(
      resolveSiteComplianceDisplay({
        icpRecordNumber: "",
        publicSecurityRecordIcon: officialIcon,
        publicSecurityRecordNumber: "陕公网安备61011302001964号",
      }).publicSecurityRecordNumber,
    ).toBe("陕公网安备61011302001964号");
  });
});
