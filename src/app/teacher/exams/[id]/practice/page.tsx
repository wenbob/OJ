import { StaffExamPracticePage } from "@/app/admin/exams/[id]/practice/staff-page";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ problemId?: string | string[] }>;
};

export default function TeacherExamPracticePage(props: PageProps) {
  return <StaffExamPracticePage {...props} role="teacher" />;
}
