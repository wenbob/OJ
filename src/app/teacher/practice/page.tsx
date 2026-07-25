import { StaffPracticePage } from "@/app/admin/practice/staff-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeacherPracticePage(props: PageProps) {
  return <StaffPracticePage {...props} role="teacher" />;
}
