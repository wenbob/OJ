import { StaffStudentLearningPage } from "@/app/admin/learning/[studentId]/staff-page";

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ window?: string | string[] }>;
};

export default function TeacherStudentLearningPage(props: PageProps) {
  return <StaffStudentLearningPage {...props} role="teacher" />;
}
