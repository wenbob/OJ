import { StaffAiUsagePage } from "@/app/admin/ai-usage/staff-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeacherAiUsagePage(props: PageProps) {
  return <StaffAiUsagePage {...props} role="teacher" />;
}
