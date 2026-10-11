import { StaffPracticeProblemPage } from "@/app/admin/practice/problems/[id]/staff-page";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeacherPracticeProblemPage(props: PageProps) {
  return <StaffPracticeProblemPage {...props} role="teacher" />;
}
