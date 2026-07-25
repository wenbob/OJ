import { StaffPracticeProblemPage } from "@/app/admin/practice/problems/[id]/staff-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function TeacherPracticeProblemPage(props: PageProps) {
  return <StaffPracticeProblemPage {...props} role="teacher" />;
}
