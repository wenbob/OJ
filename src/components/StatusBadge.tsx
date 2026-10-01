import { statusClassName } from "@/lib/status";
import { UiBadge } from "@/components/UiBadge";

export function StatusBadge({ status }: { status: string }) {
  return (
    <UiBadge
      className={`min-w-[7.75rem] ${statusClassName(status)}`}
    >
      {status}
    </UiBadge>
  );
}
