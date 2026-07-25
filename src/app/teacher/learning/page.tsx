import { StaffLearningPage } from "@/app/admin/learning/staff-page";

type PageProps = {
  searchParams: Promise<{ window?: string | string[] }>;
};

export default function TeacherLearningPage(props: PageProps) {
  return <StaffLearningPage {...props} role="teacher" />;
}
