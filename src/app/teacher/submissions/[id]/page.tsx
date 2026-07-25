import { StaffSubmissionDetailPage } from "@/app/admin/submissions/[id]/staff-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function TeacherSubmissionDetailPage(props: PageProps) {
  return <StaffSubmissionDetailPage {...props} role="teacher" />;
}
