// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { notFound } from "next/navigation";
import { AcceptedProblemIndicator } from "@/components/AcceptedProblemIndicator";
import { AppShell } from "@/components/AppShell";
import { CopyProblemButton } from "@/components/CopyProblemButton";
import { ObjectiveProblemContent } from "@/components/ObjectiveProblemContent";
import { ProblemRichText } from "@/components/ProblemRichText";
import { ProblemSamples } from "@/components/ProblemSamples";
import { ProblemSubmitForm } from "@/components/ProblemSubmitForm";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import {
  ObjectiveAiExplanationPanel,
  ObjectiveAiExplanationProvider,
} from "@/components/StaffObjectiveAiExplanation";
import {
  StaffObjectiveAnswerToggle,
  StaffObjectiveAnswerVisibilityProvider,
} from "@/components/StaffObjectiveAnswerVisibility";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatRuntime } from "@/lib/format";
import { getDisplaySamples } from "@/lib/problemSamples";
import {
  getPublicObjectiveItems,
  normalizeProblemType,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { getLatestAcceptedSubmissionIdsByProblem } from "@/lib/problemSubmissionCounts";
import {
  boolSetting,
  getDefaultCppTemplate,
  getSetting,
} from "@/lib/settings";
import {
  getExamAccessWhere,
  getStaffBasePath,
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ problemId?: string | string[] }>;
};

export async function StaffExamPracticePage({
  params,
  role,
  searchParams,
}: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const { id } = await params;
  const query = await searchParams;
  const examId = Number(id);
  const requestedProblemId = Number(
    Array.isArray(query.problemId) ? query.problemId[0] : query.problemId,
  );
  if (!Number.isInteger(examId)) notFound();

  const [exam, defaultCodeTemplate, objectiveAiExplanationSetting] = await Promise.all([
    prisma.exam.findFirst({
      where: getExamAccessWhere(user, examId),
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
    getDefaultCppTemplate(),
    getSetting("aiObjectiveExplanationEnabled"),
  ]);

  if (!exam) notFound();

  const problemIds = exam.problems.map((item) => item.problemId);
  const [latestSubmissions, latestAcceptedSubmissionIds] = await Promise.all([
    prisma.submission.findMany({
      where: {
        userId: user.id,
        submissionType: "practice",
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
    getLatestAcceptedSubmissionIdsByProblem({
      problemIds,
      userId: user.id,
    }),
  ]);

  const latestByProblem = new Map<number, (typeof latestSubmissions)[number]>();
  latestSubmissions.forEach((submission) => {
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
  const selectedAcceptedSubmissionId = selectedProblem
    ? latestAcceptedSubmissionIds.get(selectedProblem.id)
    : undefined;
  const selectedProblemType = normalizeProblemType(
    selectedProblem?.problemType,
  );
  const objectiveItems =
    selectedProblem && selectedProblemType === "objective"
      ? parseObjectiveItems(selectedProblem.objectiveItems)
      : [];
  const publicObjectiveItems = getPublicObjectiveItems(objectiveItems);
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
  const showProblemList =
    exam.examType !== "objective" || exam.problems.length > 1;
  const objectiveAiEnabled =
    selectedProblemType === "objective" &&
    boolSetting(objectiveAiExplanationSetting);

  return (
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
            Exam Practice
          </p>
          <h1 className="mt-2 text-2xl font-black">{exam.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ProblemTypeBadge type={exam.examType} />
            <p className="text-sm font-semibold text-ink-600">
              {role === "admin" ? "管理员" : "老师"}练习模式：不限时，不需要交卷，提交记录计入日常提交。
            </p>
          </div>
        </div>
        <Link className="btn btn-secondary" href={`${basePath}/exams`}>
          返回模拟考试管理
        </Link>
      </section>

      {selectedProblem ? (
        <div
          className={`grid gap-6 ${
            showProblemList ? "xl:grid-cols-[300px_minmax(0,1fr)]" : ""
          }`}
        >
          {showProblemList ? (
            <aside className="surface overflow-hidden">
              <div className="border-b border-ink-950/10 p-4">
                <h2 className="font-black">考试题目</h2>
              </div>
              <div className="divide-y divide-ink-950/10">
                {exam.problems.map((item, index) => {
                  const latest = latestByProblem.get(item.problemId);
                  const acceptedSubmissionId =
                    latestAcceptedSubmissionIds.get(item.problemId);
                  const active = item.problemId === selectedProblem.id;
                  return (
                    <div
                      className={`p-4 transition-colors hover:bg-white/70 ${
                        acceptedSubmissionId
                          ? "bg-emerald-50/80 hover:bg-emerald-100/70"
                          : active
                            ? "bg-white/75"
                            : ""
                      }`}
                      key={item.id}
                    >
                      <Link
                        className="block"
                        href={`${basePath}/exams/${exam.id}/practice?problemId=${item.problemId}`}
                      >
                        <p className="text-xs font-black text-ink-500">
                          第 {index + 1} 题
                        </p>
                        <h3 className="mt-1 font-black">{item.problem.title}</h3>
                        <p className="mt-1 text-xs font-bold text-ink-600">
                          {item.problem.category || "未分类"} / {item.score} 分
                        </p>
                      </Link>
                      <div className="mt-3">
                        {acceptedSubmissionId ? (
                          <AcceptedProblemIndicator
                            detailHrefBase={`${basePath}/submissions`}
                            problemTitle={item.problem.title}
                            problemType={normalizeProblemType(
                              item.problem.problemType,
                            )}
                            submissionId={acceptedSubmissionId}
                          />
                        ) : latest ? (
                          <StatusBadge status={latest.status} />
                        ) : (
                          <span className="inline-flex border border-ink-950/10 bg-white/70 px-2.5 py-1 text-xs font-bold text-ink-600">
                            未提交
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          ) : null}

          <StaffObjectiveAnswerVisibilityProvider
            key={`staff-objective-answers-${selectedProblem.id}`}
          >
            <ObjectiveAiExplanationProvider
              canForceRegenerate={role === "admin"}
              problemId={selectedProblem.id}
            >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
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
                {selectedAcceptedSubmissionId ? (
                  <AcceptedProblemIndicator
                    detailHrefBase={`${basePath}/submissions`}
                    problemTitle={selectedProblem.title}
                    problemType={selectedProblemType}
                    submissionId={selectedAcceptedSubmissionId}
                  />
                ) : null}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {selectedProblemType === "objective" ? (
                    <StaffObjectiveAnswerToggle />
                  ) : null}
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
                    objectiveItems={publicObjectiveItems}
                  />
                </div>
              </div>
              <ProblemSection title="题目描述" value={selectedProblem.description} />
              {selectedProblemType === "objective" ? (
                <ObjectiveProblemContent
                  items={objectiveItems}
                  showAiExplanationActions={objectiveAiEnabled}
                  staffAnswerVisibility
                />
              ) : (
                <>
                  <ProblemSection title="输入格式" value={selectedProblem.inputDescription} />
                  <ProblemSection title="输出格式" value={selectedProblem.outputDescription} />
                  <ProblemSamples samples={samples} />
                  <ProblemSection title="数据范围" value={selectedProblem.dataRange || "暂无"} />
                </>
              )}
            </article>

            {objectiveAiEnabled ? (
              <aside className="grid content-start gap-4 xl:sticky xl:top-6 xl:h-[calc(100dvh-3rem)] xl:grid-rows-[minmax(0,7fr)_minmax(0,3fr)] xl:self-start xl:overflow-hidden">
                <ObjectiveAiExplanationPanel />
                <div className="grid min-h-0 content-start gap-3 overflow-y-auto overscroll-contain">
                  {selectedLatest ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border border-ink-950/10 bg-white/70 px-3 py-2 text-xs font-bold text-ink-700">
                      <span>最近提交</span>
                      <StatusBadge status={selectedLatest.status} />
                      <span>
                        答对 {selectedLatest.passedCount}/{selectedLatest.totalCount} 小题
                      </span>
                    </div>
                  ) : null}
                  <ProblemSubmitForm
                    key={`${role}-exam-practice-${exam.id}-problem-${selectedProblem.id}`}
                    defaultCodeTemplate={defaultCodeTemplate}
                    detailHrefBase={`${basePath}/submissions`}
                    draftStorageKey={`oj-code-${role}-exam-practice-${exam.id}-problem-${selectedProblem.id}`}
                    objectiveCompact
                    problemType={selectedProblemType}
                    problemId={selectedProblem.id}
                    refreshOnSuccess
                    sampleCount={samples.length}
                  />
                </div>
              </aside>
            ) : (
              <aside className="grid content-start gap-4 xl:sticky xl:top-6 xl:self-start">
                {selectedLatest ? (
                  <section className="surface p-5">
                    <h2 className="text-lg font-black">本题最新一次练习提交</h2>
                    <div className="mt-3 grid gap-2 text-sm font-semibold text-ink-700">
                      {selectedProblemType === "objective" ? (
                        <span>
                          答对 {selectedLatest.passedCount}/{selectedLatest.totalCount} 小题
                        </span>
                      ) : (
                        <>
                          <StatusBadge status={selectedLatest.status} />
                          <span>
                            {selectedLatest.passedCount}/{selectedLatest.totalCount} 测试点
                          </span>
                          <span>{formatRuntime(selectedLatest.runtimeMs)}</span>
                          <span>{formatDate(selectedLatest.createdAt)}</span>
                          <Link
                            className="btn btn-secondary mt-2 w-full"
                            href={`${basePath}/submissions/${selectedLatest.id}`}
                          >
                            查看提交详情
                          </Link>
                        </>
                      )}
                    </div>
                  </section>
                ) : null}
                <ProblemSubmitForm
                  key={`${role}-exam-practice-${exam.id}-problem-${selectedProblem.id}`}
                  defaultCodeTemplate={defaultCodeTemplate}
                  detailHrefBase={`${basePath}/submissions`}
                  draftStorageKey={`oj-code-${role}-exam-practice-${exam.id}-problem-${selectedProblem.id}`}
                  problemType={selectedProblemType}
                  problemId={selectedProblem.id}
                  refreshOnSuccess
                  sampleCount={samples.length}
                />
              </aside>
            )}
            </div>
            </ObjectiveAiExplanationProvider>
          </StaffObjectiveAnswerVisibilityProvider>
        </div>
      ) : (
        <section className="surface p-10 text-center text-sm font-semibold text-ink-600">
          该考试暂未添加题目。
        </section>
      )}
    </AppShell>
  );
}

export default function AdminExamPracticePage(props: PageProps) {
  return <StaffExamPracticePage {...props} role="admin" />;
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
