import { StaffExamRecordsPage } from "@/app/admin/exams/[id]/records/staff-page";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeacherExamRecordsPage(props: PageProps) {
  return <StaffExamRecordsPage {...props} role="teacher" />;
}
