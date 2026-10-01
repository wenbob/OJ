import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AcademyIllustration, type AcademyIllustrationKind } from "@/components/AcademyIllustration";
import { UiIcon, type UiIconKind } from "@/components/UiIcon";

export function AcademyEmptyState({ kind, title, description, href, action, compact = false, icon = "empty" }: {
  kind?: AcademyIllustrationKind;
  title: string;
  description: string;
  href?: string;
  action?: string;
  compact?: boolean;
  icon?: UiIconKind;
}) {
  return (
    <div className={`academy-empty-state ${compact ? "academy-empty-state-compact" : ""}`}>
      {kind && !compact ? <AcademyIllustration eager kind={kind} /> : <span className="academy-empty-icon"><UiIcon kind={kind ?? icon} size={28} /></span>}
      <h2 className="academy-empty-title mt-3 text-lg font-bold text-ink-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-600">{description}</p>
      {href && action ? <Link className="btn btn-secondary mt-5" href={href}>{action}<ArrowRight aria-hidden="true" size={15} /></Link> : null}
    </div>
  );
}
