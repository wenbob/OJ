import Image from "next/image";
import {
  ICP_RECORD_LOOKUP_URL,
  publicSecurityRecordLookupUrl,
  resolveSiteComplianceDisplay,
  type SiteComplianceSettings,
} from "@/lib/siteCompliance";

export function SiteComplianceFooter({
  preview = false,
  settings,
}: {
  preview?: boolean;
  settings: SiteComplianceSettings;
}) {
  const compliance = resolveSiteComplianceDisplay(settings);
  const hasRecord = Boolean(
    compliance.icpRecordNumber || compliance.publicSecurityRecordNumber,
  );
  const Root = preview ? "div" : "footer";

  if (!hasRecord && !preview) return null;

  return (
    <Root
      aria-label={preview ? "备案页脚预览" : "网站备案信息"}
      className={
        preview
          ? "border border-ink-950/10 bg-[#f3ede1] px-4 py-4"
          : "border-t border-ink-950/10 bg-[#f3ede1] px-4 py-4"
      }
      data-site-compliance-footer
      data-site-compliance-preview={preview ? "true" : undefined}
    >
      {hasRecord ? (
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-xs font-semibold text-ink-600 sm:text-sm">
          {compliance.icpRecordNumber ? (
            <a
              className="transition-colors duration-150 hover:text-clay"
              href={ICP_RECORD_LOOKUP_URL}
              rel="noreferrer"
              target="_blank"
            >
              {compliance.icpRecordNumber}
            </a>
          ) : null}
          {compliance.publicSecurityRecordNumber ? (
            <a
              className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-clay"
              href={publicSecurityRecordLookupUrl(
                compliance.publicSecurityRecordNumber,
              )}
              rel="noreferrer"
              target="_blank"
            >
              <Image
                alt=""
                aria-hidden="true"
                className="h-5 w-5 shrink-0 object-contain"
                height={20}
                src={compliance.publicSecurityRecordIcon}
                unoptimized
                width={20}
              />
              <span>{compliance.publicSecurityRecordNumber}</span>
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-xs font-semibold text-ink-500">
          填写有效备案信息后，将在全站页脚显示。
        </p>
      )}
    </Root>
  );
}
