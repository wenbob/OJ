import { notFound } from "next/navigation";
import { AcceptedProblemIndicator } from "@/components/AcceptedProblemIndicator";
import { AppShell } from "@/components/AppShell";
import { CopyProblemButton } from "@/components/CopyProblemButton";
import { ObjectiveProblemContent } from "@/components/ObjectiveProblemContent";
import { ProblemRichText } from "@/components/ProblemRichText";
import { ProblemSamples } from "@/components/ProblemSamples";
import { ProblemSubmitForm } from "@/components/ProblemSubmitForm";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { requirePageUser } from "@/lib/auth";
import { formatDate, formatRuntime } from "@/lib/format";
import { getDisplaySamples } from "@/lib/problemSamples";
import {
  getPublicObjectiveItems,
  normalizeProblemType,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { getLatestAcceptedSubmissionIdsByProblem } from "@/lib/problemSubmissionCounts";
import { getDefaultCppTemplate } from "@/lib/settings";

const adminNav = [
  { href: "/admin", label: "后台首页" },
  { href: "/admin/practice", label: "题目练习" },
  { href: "/admin/problems", label: "题目管理" },
  { href: "/admin/exams", label: "模拟考试" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/submissions", label: "日常提交" },
  { href: "/admin/exam-submissions", label: "考试提交" },
];

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminPracticeProblemPage({ params }: PageProps) {
  const user = await requirePageUser("admin");
  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId)) notFound();

  const [
    problem,
    latestSubmission,
    latestAcceptedSubmissionIds,
    defaultCodeTemplate,
  ] = await Promise.all([
    prisma.problem.findUnique({
      where: { id: problemId },
      include: {
        testCases: {
          where: { isSample: true },
          orderBy: { id: "asc" },
        },
      },
    }),
    prisma.submission.findFirst({
      where: { userId: user.id, problemId, submissionType: "practice" },
      orderBy: { createdAt: "desc" },
    }),
    getLatestAcceptedSubmissionIdsByProblem({
      problemIds: [problemId],
      userId: user.id,
    }),
    getDefaultCppTemplate(),
  ]);

  if (!problem || problem.archivedAt) notFound();
  const problemType = normalizeProblemType(problem.problemType);
  const latestAcceptedSubmissionId =
    latestAcceptedSubmissionIds.get(problem.id);
  const objectiveItems =
    problemType === "objective"
      ? parseObjectiveItems(problem.objectiveItems)
      : [];
  const publicObjectiveItems = getPublicObjectiveItems(objectiveItems);
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
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
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
            {latestAcceptedSubmissionId ? (
              <AcceptedProblemIndicator
                problemTitle={problem.title}
                problemType={problemType}
                submissionId={latestAcceptedSubmissionId}
              />
            ) : null}
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
              objectiveItems={publicObjectiveItems}
            />
          </div>
          <ProblemSection title="题目描述" value={problem.description} />
          {problemType === "objective" ? (
            <ObjectiveProblemContent items={objectiveItems} showAnswers />
          ) : (
            <>
              <ProblemSection title="输入格式" value={problem.inputDescription} />
              <ProblemSection title="输出格式" value={problem.outputDescription} />
              <ProblemSamples samples={samples} />
              <ProblemSection title="数据范围" value={problem.dataRange || "暂无"} />
            </>
          )}
        </article>

        <aside className="grid content-start gap-4 xl:sticky xl:top-6 xl:self-start">
          {latestSubmission ? (
            <section className="surface p-5">
              <h2 className="text-lg font-black">最近一次提交</h2>
              <div className="mt-3 grid gap-2 text-sm font-semibold text-ink-700">
                {problemType === "objective" ? (
                  <span>
                    答对 {latestSubmission.passedCount}/{latestSubmission.totalCount} 小题
                  </span>
                ) : (
                  <>
                    <StatusBadge status={latestSubmission.status} />
                    <span>
                      {latestSubmission.passedCount}/{latestSubmission.totalCount} 测试点
                    </span>
                    <span>{formatRuntime(latestSubmission.runtimeMs)}</span>
                    <span>{formatDate(latestSubmission.createdAt)}</span>
                    {latestSubmission.errorMessage ? (
                      <pre className="mt-2 max-h-44 overflow-auto border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                        {latestSubmission.errorMessage}
                      </pre>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          ) : null}
          <ProblemSubmitForm
            defaultCodeTemplate={defaultCodeTemplate}
            detailHrefBase="/admin/submissions"
            problemType={problemType}
            problemId={problem.id}
            refreshOnSuccess
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
      <ProblemRichText
        className="mt-3 leading-7 text-ink-800"
        codeClassName="text-sm"
        value={value}
      />
    </section>
  );
}
