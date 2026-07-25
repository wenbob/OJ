import { StaffEditExamPage } from "@/app/admin/exams/[id]/edit/staff-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function TeacherEditExamPage(props: PageProps) {
  return <StaffEditExamPage {...props} role="teacher" />;
}
