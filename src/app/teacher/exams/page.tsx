import { StaffExamsPage } from "@/app/admin/exams/staff-page";

export default function TeacherExamsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <StaffExamsPage role="teacher" {...props} />;
}
