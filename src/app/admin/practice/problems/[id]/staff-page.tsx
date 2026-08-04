// Shared server page for administrator and teacher shells.
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
  getStaffBasePath,
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function StaffPracticeProblemPage({
  params,
  role,
}: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId)) notFound();

  const [
    problem,
    latestSubmission,
    latestAcceptedSubmissionIds,
    defaultCodeTemplate,
    objectiveAiExplanationSetting,
    staffProgrammingAssistSetting,
    staffProgrammingCooldownSeconds,
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
    getSetting("aiObjectiveExplanationEnabled"),
    getSetting("aiStaffProgrammingAssistEnabled"),
    getAiCooldownSeconds("programming", role),
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
  const objectiveAiEnabled =
    problemType === "objective" &&
    boolSetting(objectiveAiExplanationSetting);
  const staffProgrammingAiEnabled =
    problemType === "programming" &&
    boolSetting(staffProgrammingAssistSetting);
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
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <StaffObjectiveAnswerVisibilityProvider
        key={`staff-objective-answers-${problem.id}`}
      >
        <ObjectiveAiExplanationProvider
          canForceRegenerate
          problemId={problem.id}
        >
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
                  detailHrefBase={`${basePath}/submissions`}
                  problemTitle={problem.title}
                  problemType={problemType}
                  submissionId={latestAcceptedSubmissionId}
                />
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {problemType === "objective" ? (
                  <StaffObjectiveAnswerToggle />
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
            </div>
            <ProblemSection title="题目描述" value={problem.description} />
            {problemType === "objective" ? (
              <ObjectiveProblemContent
                items={objectiveItems}
                showAiExplanationActions={objectiveAiEnabled}
                staffAnswerVisibility
              />
            ) : (
              <>
                <ProblemSection title="输入格式" value={problem.inputDescription} />
                <ProblemSection title="输出格式" value={problem.outputDescription} />
                <ProblemSamples samples={samples} />
                <ProblemSection title="数据范围" value={problem.dataRange || "暂无"} />
              </>
            )}
          </article>

          {objectiveAiEnabled ? (
            <aside className="grid content-start gap-4 xl:sticky xl:top-6 xl:h-[calc(100dvh-3rem)] xl:grid-rows-[minmax(0,7fr)_minmax(0,3fr)] xl:self-start xl:overflow-hidden">
              <ObjectiveAiExplanationPanel />
              <div className="grid min-h-0 content-start gap-3 overflow-y-auto overscroll-contain">
                {latestSubmission ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border border-ink-950/10 bg-white/70 px-3 py-2 text-xs font-bold text-ink-700">
                    <span>最近提交</span>
                    <StatusBadge status={latestSubmission.status} />
                    <span>
                      答对 {latestSubmission.passedCount}/{latestSubmission.totalCount} 小题
                    </span>
                  </div>
                ) : null}
                <ProblemSubmitForm
                  defaultCodeTemplate={defaultCodeTemplate}
                  detailHrefBase={`${basePath}/submissions`}
                  objectiveCompact
                  problemType={problemType}
                  problemId={problem.id}
                  refreshOnSuccess
                  sampleCount={samples.length}
                />
              </div>
            </aside>
          ) : (
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
                aiCooldownSeconds={staffProgrammingCooldownSeconds ?? 30}
                aiEnabled={staffProgrammingAiEnabled}
                aiEndpoint={`/api/admin/problems/${problem.id}/programming-assist`}
                aiStudentId={user.id}
                defaultCodeTemplate={defaultCodeTemplate}
                detailHrefBase={`${basePath}/submissions`}
                problemType={problemType}
                problemId={problem.id}
                refreshOnSuccess
                sampleCount={samples.length}
              />
            </aside>
          )}
          </div>
        </ObjectiveAiExplanationProvider>
      </StaffObjectiveAnswerVisibilityProvider>
    </AppShell>
  );
}

export default function AdminPracticeProblemPage(props: PageProps) {
  return <StaffPracticeProblemPage {...props} role="admin" />;
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
