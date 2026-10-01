// Shared server page for administrator and teacher shells.
import { AcademyEmptyState } from "@/components/AcademyEmptyState";
import { PageHeading } from "@/components/PageHeading";
import { UiBadge } from "@/components/UiBadge";
import { ProblemContentSection as ProblemSection } from "@/components/ProblemContentSection";
import { ProblemEntryLink } from "@/components/ProblemEntryLink";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AcceptedProblemIndicator } from "@/components/AcceptedProblemIndicator";
import { CopyProblemButton } from "@/components/CopyProblemButton";
import { ObjectiveProblemContent } from "@/components/ObjectiveProblemContent";

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
import { getAiCooldownSeconds } from "@/lib/aiRuntimeSettings";
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

  const [
    exam,
    defaultCodeTemplate,
    objectiveAiExplanationSetting,
    staffProgrammingAssistSetting,
    staffProgrammingCooldownSeconds,
  ] = await Promise.all([
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
    getSetting("aiStaffProgrammingAssistEnabled"),
    getAiCooldownSeconds("programming", role),
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
  const staffProgrammingAiEnabled =
    selectedProblemType === "programming" &&
    boolSetting(staffProgrammingAssistSetting);

  return (
    <>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="arena-kicker">
            Exam Practice
          </p>
          <PageHeading kind="exam" className="mt-2">{exam.title}</PageHeading>
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
                      className={`problem-entry p-4 ${acceptedSubmissionId ? "" : "problem-hover-incomplete"}`}
                      data-accepted={Boolean(acceptedSubmissionId)}
                      data-active={active}
                      key={item.id}
                    >
                      <ProblemEntryLink
                        className="block"
                        contentAs="div"
                        contentClassName="w-full !flex-col !items-stretch"
                        href={`${basePath}/exams/${exam.id}/practice?problemId=${item.problemId}`}
                      >
                        <p className="text-xs font-black text-ink-500">
                          第 {index + 1} 题
                        </p>
                        <h3 className="mt-1 break-words font-bold">{item.problem.title}</h3>
                        <p className="mt-1 text-xs font-bold text-ink-600">
                          {item.problem.category || "未分类"} / {item.score} 分
                        </p>
                      </ProblemEntryLink>
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
                          <UiBadge className="inline-flex border border-ink-950/10 bg-white/70 px-2.5 py-1 text-xs font-bold text-ink-600">
                            未提交
                          </UiBadge>
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
              canForceRegenerate
              problemId={selectedProblem.id}
            >
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_460px]">
            <article className="surface min-w-0 p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <PageHeading as="h2" kind="problem">{selectedProblem.title}</PageHeading>
                <UiBadge tone="neutral">{selectedProblem.difficulty}</UiBadge>
                <UiBadge tone="neutral">{selectedProblem.category || "未分类"}</UiBadge>
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
              <ProblemSection headingLevel={3} title="题目描述" value={selectedProblem.description} />
              {selectedProblemType === "objective" ? (
                <ObjectiveProblemContent
                  items={objectiveItems}
                  showAiExplanationActions={objectiveAiEnabled}
                  staffAnswerVisibility
                />
              ) : (
                <>
                  <ProblemSection headingLevel={3} title="输入格式" value={selectedProblem.inputDescription} />
                  <ProblemSection headingLevel={3} title="输出格式" value={selectedProblem.outputDescription} />
                  <ProblemSamples headingLevel={3} samples={samples} />
                  <ProblemSection headingLevel={3} title="数据范围" value={selectedProblem.dataRange || "暂无"} />
                </>
              )}
            </article>

            {objectiveAiEnabled ? (
              <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 xl:self-start">
                <ObjectiveAiExplanationPanel />
                <div className="grid content-start gap-3">
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
              <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 xl:sticky xl:top-6 xl:self-start">
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
                  aiCooldownSeconds={staffProgrammingCooldownSeconds ?? 30}
                  aiEnabled={staffProgrammingAiEnabled}
                  aiEndpoint={`/api/admin/problems/${selectedProblem.id}/programming-assist`}
                  aiExamId={exam.id}
                  aiStudentId={user.id}
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
          <AcademyEmptyState compact icon="exam" title="该考试暂未添加题目" description="当前没有可显示的考试题目。" />
        </section>
      )}
    </>
  );
}

export default function AdminExamPracticePage(props: PageProps) {
  return <StaffExamPracticePage {...props} role="admin" />;
}
