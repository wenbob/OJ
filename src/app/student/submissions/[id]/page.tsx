import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SubmissionDetailView } from "@/components/SubmissionDetailView";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeSubmissionForStudent } from "@/lib/submissionVisibility";

const studentNav = [
  { href: "/student", label: "首页" },
  { href: "/student/problems", label: "日常刷题" },
  { href: "/student/exams", label: "模拟考试" },
  { href: "/student/submissions", label: "日常提交" },
  { href: "/student/exam-submissions", label: "考试提交" },
];

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StudentSubmissionDetailPage({ params }: PageProps) {
  const user = await requirePageUser("student");
  const { id } = await params;
  const submissionId = Number(id);
  if (!Number.isInteger(submissionId)) notFound();

  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, userId: user.id },
    include: {
      exam: { select: { id: true, title: true } },
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, title: true } },
      caseResults: { orderBy: { caseIndex: "asc" } },
    },
  });

  if (!submission) notFound();

  const isExamSubmission = submission.submissionType === "exam";
  const examRecord =
    isExamSubmission && submission.exam
      ? await prisma.examRecord.findUnique({
          where: {
            examId_userId: {
              examId: submission.exam.id,
              userId: user.id,
            },
          },
          select: { status: true },
        })
      : null;
  const continueHref = isExamSubmission && submission.exam && examRecord?.status === "in_progress"
    ? `/student/exams/${submission.exam.id}/take?problemId=${submission.problem.id}&fromSubmission=${submission.id}`
    : !isExamSubmission
      ? `/student/problems/${submission.problem.id}?fromSubmission=${submission.id}`
      : undefined;
  const problemHref = isExamSubmission && submission.exam
    ? `/student/exams/${submission.exam.id}/take?problemId=${submission.problem.id}`
    : `/student/problems/${submission.problem.id}`;

  return (
    <AppShell nav={studentNav} title="学生端" user={user}>
        <SubmissionDetailView
          continueHref={continueHref}
          problemHref={problemHref}
          submission={sanitizeSubmissionForStudent(submission)}
        />
    </AppShell>
  );
}
