// Shared server page for administrator and teacher shells.
import { notFound } from "next/navigation";
import { SubmissionDetailView } from "@/components/SubmissionDetailView";
import { prisma } from "@/lib/prisma";
import {
  getStaffBasePath,
  getStaffSubmissionWhere,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function StaffSubmissionDetailPage({
  params,
  role,
}: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const { id } = await params;
  const submissionId = Number(id);
  if (!Number.isInteger(submissionId)) notFound();

  const submission = await prisma.submission.findFirst({
    where: {
      AND: [{ id: submissionId }, getStaffSubmissionWhere(user)],
    },
    include: {
      exam: { select: { id: true, title: true } },
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, title: true } },
      caseResults: { orderBy: { caseIndex: "asc" } },
    },
  });

  if (!submission) notFound();

  const problemHref = `${basePath}/practice/problems/${submission.problem.id}`;

  return (
    <>
      <SubmissionDetailView
        problemHref={problemHref}
        submission={submission}
      />
    </>
  );
}

export default function AdminSubmissionDetailPage(props: PageProps) {
  return <StaffSubmissionDetailPage {...props} role="admin" />;
}
