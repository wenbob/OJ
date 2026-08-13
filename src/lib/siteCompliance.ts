export const ICP_RECORD_LOOKUP_URL = "https://beian.miit.gov.cn/";
export const PUBLIC_SECURITY_RECORD_LOOKUP_URL =
  "https://beian.mps.gov.cn/#/query/webSearch";

export const ICP_RECORD_NUMBER_MAX_CHARS = 64;
export const PUBLIC_SECURITY_RECORD_NUMBER_MAX_CHARS = 64;
export const MAX_PUBLIC_SECURITY_RECORD_ICON_BYTES = 64 * 1024;

const icpRecordNumberPattern =
  /^[\u3400-\u9fff]ICP备\d{6,20}号(?:-\d+)?$/u;
const publicSecurityRecordNumberPattern =
  /^([\u3400-\u9fff])公网安备(\d{14})号$/u;

export type SiteComplianceSettings = {
  icpRecordNumber: string;
  publicSecurityRecordIcon: string;
  publicSecurityRecordNumber: string;
};

export function normalizeIcpRecordNumber(value: string) {
  return value.trim();
}

export function normalizePublicSecurityRecordNumber(value: string) {
  return value.trim();
}

export function validateIcpRecordNumber(value: string) {
  const normalized = normalizeIcpRecordNumber(value);
  if (!normalized) return "";
  if (normalized.length > ICP_RECORD_NUMBER_MAX_CHARS) {
    return `ICP备案号不能超过 ${ICP_RECORD_NUMBER_MAX_CHARS} 个字符`;
  }
  if (!icpRecordNumberPattern.test(normalized)) {
    return "ICP备案号格式不正确，例如：陕ICP备2026021441号-1";
  }
  return "";
}

export function validatePublicSecurityRecordNumber(value: string) {
  const normalized = normalizePublicSecurityRecordNumber(value);
  if (!normalized) return "";
  if (normalized.length > PUBLIC_SECURITY_RECORD_NUMBER_MAX_CHARS) {
    return `公安备案号不能超过 ${PUBLIC_SECURITY_RECORD_NUMBER_MAX_CHARS} 个字符`;
  }
  if (!publicSecurityRecordNumberPattern.test(normalized)) {
    return "公安备案号格式不正确，例如：陕公网安备61011302000000号";
  }
  return "";
}

export function extractPublicSecurityRecordCode(value: string) {
  return normalizePublicSecurityRecordNumber(value).match(
    publicSecurityRecordNumberPattern,
  )?.[2] ?? "";
}

export function publicSecurityRecordLookupUrl(recordNumber: string) {
  const code = extractPublicSecurityRecordCode(recordNumber);
  return code
    ? `${PUBLIC_SECURITY_RECORD_LOOKUP_URL}?code=${encodeURIComponent(code)}`
    : "";
}

export function resolveSiteComplianceDisplay(
  settings: SiteComplianceSettings,
) {
  const icpRecordNumber = normalizeIcpRecordNumber(settings.icpRecordNumber);
  const publicSecurityRecordNumber = normalizePublicSecurityRecordNumber(
    settings.publicSecurityRecordNumber,
  );
  const publicSecurityRecordCode = extractPublicSecurityRecordCode(
    publicSecurityRecordNumber,
  );
  const publicSecurityRecordIcon =
    settings.publicSecurityRecordIcon.startsWith("data:image/png;base64,")
      ? settings.publicSecurityRecordIcon
      : "";

  return {
    icpRecordNumber:
      icpRecordNumber && !validateIcpRecordNumber(icpRecordNumber)
        ? icpRecordNumber
        : "",
    publicSecurityRecordCode:
      publicSecurityRecordCode && publicSecurityRecordIcon
        ? publicSecurityRecordCode
        : "",
    publicSecurityRecordIcon:
      publicSecurityRecordCode && publicSecurityRecordIcon
        ? publicSecurityRecordIcon
        : "",
    publicSecurityRecordNumber:
      publicSecurityRecordCode && publicSecurityRecordIcon
        ? publicSecurityRecordNumber
        : "",
  };
}
