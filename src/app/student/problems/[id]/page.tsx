import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CopyProblemButton } from "@/components/CopyProblemButton";
import { ObjectiveProblemContent } from "@/components/ObjectiveProblemContent";
import { ProblemSamples } from "@/components/ProblemSamples";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { requirePageUser } from "@/lib/auth";
import { getDisplaySamples } from "@/lib/problemSamples";
import {
  getPublicObjectiveItems,
  normalizeProblemType,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { boolSetting, getDefaultCppTemplate, getSetting } from "@/lib/settings";
import { SubmitForm } from "./submit-form";

const studentNav = [
  { href: "/student", label: "首页" },
  { href: "/student/problems", label: "日常刷题" },
  { href: "/student/exams", label: "模拟考试" },
  { href: "/student/submissions", label: "日常提交" },
  { href: "/student/exam-submissions", label: "考试提交" },
];

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    assignment?: string | string[];
    fromSubmission?: string | string[];
  }>;
};

export default async function StudentProblemDetailPage({
  params,
  searchParams,
}: PageProps) {
  const user = await requirePageUser("student");
  const { id } = await params;
  const query = await searchParams;
  const fromSubmissionValue = Array.isArray(query.fromSubmission)
    ? query.fromSubmission[0]
    : query.fromSubmission;
  const fromSubmissionId = fromSubmissionValue
    ? Number(fromSubmissionValue)
    : undefined;
  const assignmentValue = Array.isArray(query.assignment)
    ? query.assignment[0]
    : query.assignment;
  const requestedAssignmentId = assignmentValue ? Number(assignmentValue) : undefined;
  const problemId = Number(id);
  if (!Number.isInteger(problemId)) notFound();

  const [
    problem,
    defaultCodeTemplate,
    aiPracticeEnabled,
    studentProfile,
    assignment,
  ] =
    await Promise.all([
      prisma.problem.findUnique({
        where: { id: problemId },
        include: {
          testCases: {
            where: { isSample: true },
            orderBy: { id: "asc" },
          },
        },
      }),
      getDefaultCppTemplate(),
      getSetting("aiPracticeEnabled"),
      prisma.studentProfile.findUnique({
        where: { userId: user.id },
        select: { aiAccessEnabled: true },
      }),
      Number.isInteger(requestedAssignmentId)
        ? prisma.learningAssignment.findFirst({
            where: {
              id: requestedAssignmentId,
              studentId: user.id,
              problems: { some: { problemId } },
            },
            select: { id: true, status: true, title: true },
          })
        : Promise.resolve(null),
    ]);

  if (!problem) notFound();
  const problemType = normalizeProblemType(problem.problemType);
  const objectiveItems =
    problemType === "objective"
      ? getPublicObjectiveItems(parseObjectiveItems(problem.objectiveItems))
      : [];
  const samples = getDisplaySamples({
    sampleInput: problem.sampleInput,
    sampleOutput: problem.sampleOutput,
    testCases: problem.testCases.map((testCase) => ({
      id: testCase.id,
      input: testCase.input,
      output: testCase.output,
    })),
  });

  return (
    <AppShell nav={studentNav} title="学生端" user={user}>
      {assignment ? (
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-steel/30 bg-[#eef6fb] px-4 py-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-steel">
              来自专项练习
            </p>
            <p className="mt-1 font-black text-ink-950">{assignment.title}</p>
            {assignment.status !== "active" ? (
              <p className="mt-1 text-xs font-bold text-amber-800">
                该任务已归档，本次提交只作为普通日常练习，不再计入任务进度。
              </p>
            ) : null}
          </div>
          <Link className="btn btn-secondary" href={`/student/assignments/${assignment.id}`}>
            返回专项练习
          </Link>
        </section>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(520px,44%)]">
        <article className="surface p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black">{problem.title}</h1>
            <span className="border border-ink-950/10 bg-white/65 px-2.5 py-1 text-xs font-bold text-ink-700">
              {problem.difficulty}
            </span>
            <span className="border border-ink-950/10 bg-white/65 px-2.5 py-1 text-xs font-bold text-ink-700">
              {problem.category}
            </span>
            <ProblemTypeBadge type={problemType} />
            <CopyProblemButton
              category={problem.category}
              dataRange={problem.dataRange}
              description={problem.description}
              difficulty={problem.difficulty}
              inputDescription={problem.inputDescription}
              outputDescription={problem.outputDescription}
              samples={samples}
              title={problem.title}
              problemType={problemType}
              objectiveItems={objectiveItems}
            />
          </div>
          <ProblemSection title="题目描述" value={problem.description} />
          {problemType === "objective" ? (
            <ObjectiveProblemContent items={objectiveItems} />
          ) : (
            <>
              <ProblemSection title="输入格式" value={problem.inputDescription} />
              <ProblemSection title="输出格式" value={problem.outputDescription} />
              <ProblemSamples samples={samples} />
              <ProblemSection title="数据范围" value={problem.dataRange || "暂无"} />
            </>
          )}
        </article>

        <aside className="grid content-start gap-4 xl:self-start">
          <SubmitForm
            aiEnabled={
              problemType === "programming" &&
              boolSetting(aiPracticeEnabled) &&
              Boolean(studentProfile?.aiAccessEnabled)
            }
            aiStudentId={user.id}
            defaultCodeTemplate={defaultCodeTemplate}
            fromSubmissionId={
              Number.isInteger(fromSubmissionId) ? fromSubmissionId : undefined
            }
            learningAssignmentId={
              assignment?.status === "active" ? assignment.id : undefined
            }
            problemType={problemType}
            problemId={problem.id}
            sampleCount={samples.length}
          />
        </aside>
      </div>
    </AppShell>
  );
}

function ProblemSection({ title, value }: { title: string; value: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap leading-7 text-ink-800">{value}</p>
    </section>
  );
}
