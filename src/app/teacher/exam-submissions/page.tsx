import { StaffExamSubmissionsPage } from "@/app/admin/exam-submissions/staff-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeacherExamSubmissionsPage(props: PageProps) {
  return <StaffExamSubmissionsPage {...props} role="teacher" />;
}
