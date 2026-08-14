import { notFound, redirect } from "next/navigation";
import { CopyProblemButton } from "@/components/CopyProblemButton";
import { ExamCountdown } from "@/components/ExamCountdown";
import { ExamExitGuard } from "@/components/ExamExitGuard";
import { ExamSubmitButton } from "@/components/ExamSubmitButton";
import { NavigationLink } from "@/components/NavigationLink";
import { ObjectiveProblemContent } from "@/components/ObjectiveProblemContent";
import { ProblemRichText } from "@/components/ProblemRichText";
import { ProblemSamples } from "@/components/ProblemSamples";
import { ProblemSubmitForm } from "@/components/ProblemSubmitForm";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { requirePageUser } from "@/lib/auth";
import { getAiCooldownSeconds } from "@/lib/aiRuntimeSettings";
import { expireExamRecordIfNeeded, getExamEndAt } from "@/lib/examScoring";
import { formatDate } from "@/lib/format";
import {
  getPublicObjectiveItems,
  normalizeProblemType,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { getDisplaySamples } from "@/lib/problemSamples";
import { prisma } from "@/lib/prisma";
import { getDefaultCppTemplate } from "@/lib/settings";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    fromSubmission?: string | string[];
    problemId?: string | string[];
  }>;
};

export default async function StudentExamTakePage({
  params,
  searchParams,
}: PageProps) {
  const user = await requirePageUser("student");
  const { id } = await params;
  const query = await searchParams;
  const examId = Number(id);
  const requestedProblemId = Number(
    Array.isArray(query.problemId) ? query.problemId[0] : query.problemId,
  );
  const fromSubmissionValue = Array.isArray(query.fromSubmission)
    ? query.fromSubmission[0]
    : query.fromSubmission;
  const fromSubmissionId = fromSubmissionValue
    ? Number(fromSubmissionValue)
    : undefined;
  if (!Number.isInteger(examId)) notFound();

  const [exam, checkedRecord, studentProfile] = await Promise.all([
    prisma.exam.findUnique({
      where: { id: examId },
      include: {
        problems: {
          include: {
            problem: {
              include: {
                testCases: {
                  where: { isSample: true },
                  orderBy: { id: "asc" },
                },
              },
            },
          },
          orderBy: [{ order: "asc" }, { id: "asc" }],
        },
      },
    }),
    expireExamRecordIfNeeded({ examId, userId: user.id }),
    prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { aiAccessEnabled: true },
    }),
  ]);

  if (!exam) notFound();
  if (!checkedRecord) redirect(`/student/exams/${examId}`);
  if (checkedRecord.status !== "in_progress" || exam.status !== "published") {
    redirect(`/student/exams/${examId}/result`);
  }

  const endAt =
    getExamEndAt(checkedRecord.startedAt, exam.durationMin)?.toISOString() ??
    null;

  const problemIds = exam.problems.map((item) => item.problemId);
  const [latestSubmissions, defaultCodeTemplate, aiCooldownSeconds] =
    await Promise.all([
      prisma.submission.findMany({
        where: {
          examId,
          userId: user.id,
          submissionType: "exam",
          problemId: { in: problemIds },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          problemId: true,
          status: true,
          passedCount: true,
          totalCount: true,
          runtimeMs: true,
          createdAt: true,
        },
      }),
      getDefaultCppTemplate(),
      getAiCooldownSeconds("programming", "student"),
    ]);

  const latestByProblem = new Map<number, (typeof latestSubmissions)[number]>();
  const acceptedProblemIds = new Set<number>();
  latestSubmissions.forEach((submission) => {
    if (submission.status === "Accepted") {
      acceptedProblemIds.add(submission.problemId);
    }
    if (!latestByProblem.has(submission.problemId)) {
      latestByProblem.set(submission.problemId, submission);
    }
  });

  const selectedItem =
    exam.problems.find((item) => item.problemId === requestedProblemId) ??
    exam.problems[0];
  const selectedProblem = selectedItem?.problem;
  const selectedLatest = selectedProblem
    ? latestByProblem.get(selectedProblem.id)
    : null;
  const selectedProblemType = normalizeProblemType(
    selectedProblem?.problemType,
  );
  const objectiveItems =
    selectedProblem && selectedProblemType === "objective"
      ? getPublicObjectiveItems(
          parseObjectiveItems(selectedProblem.objectiveItems),
        )
      : [];
  const samples = selectedProblem
    ? getDisplaySamples({
        sampleInput: selectedProblem.sampleInput,
        sampleOutput: selectedProblem.sampleOutput,
        testCases: selectedProblem.testCases.map((testCase) => ({
          id: testCase.id,
          input: testCase.input,
          output: testCase.output,
        })),
      })
    : [];
  const showProblemTabs = exam.problems.length > 1;

  return (
    <>
      <ExamExitGuard examId={exam.id} />
      <section className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
            Taking Exam
          </p>
          <h1 className="mt-2 text-2xl font-black">{exam.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ProblemTypeBadge type={exam.examType} />
            <p className="text-sm font-semibold text-ink-600">
              {exam.durationMin
                ? `考试时长：${exam.durationMin} 分钟`
                : "不限时"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExamCountdown
            endAt={endAt}
            examId={exam.id}
            serverNow={new Date().toISOString()}
          />
          {exam.examType === "objective" ? (
            <span className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              选择判断考试请使用“提交答案”确认交卷
            </span>
          ) : (
            <ExamSubmitButton examId={exam.id} />
          )}
        </div>
      </section>

      {showProblemTabs && selectedProblem ? (
        <nav
          aria-label="考试题目切换"
          className="surface mb-6"
          data-exam-problem-tabs
        >
          <div className="exam-problem-tabs-track">
            {exam.problems.map((item, index) => {
              const latest = latestByProblem.get(item.problemId);
              const active = item.problemId === selectedProblem.id;
              const isProgramming =
                normalizeProblemType(
                  item.snapshotProblemType ?? item.problem.problemType,
                ) === "programming";
              const isAccepted =
                isProgramming && acceptedProblemIds.has(item.problemId);
              const statusLabel = isAccepted
                ? "已通过"
                : latest
                  ? isProgramming
                    ? "未通过"
                    : "已作答"
                  : "未提交";
              return (
                <NavigationLink
                  aria-current={active ? "page" : undefined}
                  className={`exam-problem-tab ${
                    isAccepted ? "is-accepted" : "problem-hover-incomplete"
                  } ${active ? "is-active" : ""}`}
                  href={`/student/exams/${exam.id}/take?problemId=${item.problemId}`}
                  key={item.id}
                  pendingLabel={`正在打开第 ${index + 1} 题`}
                  contentClassName="exam-problem-tab-content"
                >
                  <span className="exam-problem-tab-index">{index + 1}</span>
                  <span className="exam-problem-tab-title">
                    {item.snapshotTitle ?? item.problem.title}
                  </span>
                  <span className="exam-problem-tab-status">{statusLabel}</span>
                </NavigationLink>
              );
            })}
          </div>
        </nav>
      ) : null}

      {selectedProblem ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,58fr)_minmax(420px,42fr)]">
          <article className="surface p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-black">{selectedProblem.title}</h2>
              <span className="border border-ink-950/10 bg-white/65 px-2.5 py-1 text-xs font-bold text-ink-700">
                {selectedProblem.difficulty}
              </span>
              <span className="border border-ink-950/10 bg-white/65 px-2.5 py-1 text-xs font-bold text-ink-700">
                {selectedProblem.category || "未分类"}
              </span>
              <ProblemTypeBadge type={selectedProblemType} />
              <CopyProblemButton
                category={selectedProblem.category}
                dataRange={selectedProblem.dataRange}
                description={selectedProblem.description}
                difficulty={selectedProblem.difficulty}
                inputDescription={selectedProblem.inputDescription}
                outputDescription={selectedProblem.outputDescription}
                samples={samples}
                title={selectedProblem.title}
                problemType={selectedProblemType}
                objectiveItems={objectiveItems}
              />
            </div>
            <ProblemSection
              title="题目描述"
              value={selectedProblem.description}
            />
            {selectedProblemType === "objective" ? (
              <ObjectiveProblemContent items={objectiveItems} />
            ) : (
              <>
                <ProblemSection
                  title="输入格式"
                  value={selectedProblem.inputDescription}
                />
                <ProblemSection
                  title="输出格式"
                  value={selectedProblem.outputDescription}
                />
                <ProblemSamples samples={samples} />
                <ProblemSection
                  title="数据范围"
                  value={selectedProblem.dataRange || "暂无"}
                />
              </>
            )}
          </article>

          <aside className="grid content-start gap-4 xl:sticky xl:top-6 xl:self-start">
            {selectedLatest ? (
              <section className="surface p-5">
                <h2 className="text-lg font-black">本题最近一次考试提交</h2>
                <div className="mt-3 grid gap-2 text-sm font-semibold text-ink-700">
                  {selectedProblemType === "objective" ? (
                    <span>
                      答对 {selectedLatest.passedCount}/
                      {selectedLatest.totalCount} 小题
                    </span>
                  ) : (
                    <>
                      <StatusBadge status={selectedLatest.status} />
                      <span>
                        {selectedLatest.passedCount}/{selectedLatest.totalCount}{" "}
                        测试点
                      </span>
                      <span>{selectedLatest.runtimeMs}ms</span>
                      <span>{formatDate(selectedLatest.createdAt)}</span>
                    </>
                  )}
                </div>
              </section>
            ) : null}
            <ProblemSubmitForm
              aiCooldownSeconds={aiCooldownSeconds ?? undefined}
              aiEnabled={
                selectedProblemType === "programming" &&
                exam.aiEnabled &&
                Boolean(studentProfile?.aiAccessEnabled)
              }
              aiStudentId={user.id}
              key={`exam-${exam.id}-problem-${selectedProblem.id}-${
                Number.isInteger(fromSubmissionId) ? fromSubmissionId : "draft"
              }`}
              defaultCodeTemplate={defaultCodeTemplate}
              detailHrefBase="/student/submissions"
              examId={exam.id}
              examEndsAt={endAt}
              fromSubmissionId={
                Number.isInteger(fromSubmissionId)
                  ? fromSubmissionId
                  : undefined
              }
              problemType={selectedProblemType}
              problemId={selectedProblem.id}
              sampleCount={samples.length}
              refreshOnSuccess
            />
          </aside>
        </div>
      ) : (
        <section className="surface p-10 text-center text-sm font-semibold text-ink-600">
          该考试暂未添加题目。
        </section>
      )}
    </>
  );
}

function ProblemSection({ title, value }: { title: string; value: string }) {
  return (
    <section className="mt-8">
      <h3 className="text-xl font-black">{title}</h3>
      <ProblemRichText
        className="mt-3 leading-7 text-ink-800"
        codeClassName="text-sm"
        value={value}
      />
    </section>
  );
}
