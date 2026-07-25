import { StaffAiUsageStudentPage } from "@/app/admin/ai-usage/[studentId]/staff-page";

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeacherAiUsageStudentPage(props: PageProps) {
  return <StaffAiUsageStudentPage {...props} role="teacher" />;
}
