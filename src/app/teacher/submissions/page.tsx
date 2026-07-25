import { StaffSubmissionsPage } from "@/app/admin/submissions/staff-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeacherSubmissionsPage(props: PageProps) {
  return <StaffSubmissionsPage {...props} role="teacher" />;
}
