import { notFound } from "next/navigation";
import Link from "next/link";
import { CopyProblemButton } from "@/components/CopyProblemButton";
import { ObjectiveProblemContent } from "@/components/ObjectiveProblemContent";
import {
  ObjectiveAiExplanationPanel,
  ObjectiveAiExplanationProvider,
} from "@/components/StaffObjectiveAiExplanation";
import { ProblemRichText } from "@/components/ProblemRichText";
import { ProblemSamples } from "@/components/ProblemSamples";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { requirePageUser } from "@/lib/auth";
import { getAiCooldownSeconds } from "@/lib/aiRuntimeSettings";
import { getDisplaySamples } from "@/lib/problemSamples";
import {
  getPublicObjectiveItems,
  normalizeProblemType,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { boolSetting, getDefaultCppTemplate, getSetting } from "@/lib/settings";
import { getStudentObjectiveAiDisplayState } from "@/lib/studentObjectiveAi";
import { SubmitForm } from "./submit-form";

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
    aiCooldownSeconds,
    studentProfile,
    objectiveAiMasterSetting,
    studentObjectiveAiSetting,
    priorPracticeSubmission,
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
      getAiCooldownSeconds("programming", "student"),
      prisma.studentProfile.findUnique({
        where: { userId: user.id },
        select: {
          aiAccessEnabled: true,
          objectiveAiAccessEnabled: true,
        },
      }),
      getSetting("aiObjectiveExplanationEnabled"),
      getSetting("aiStudentObjectiveExplanationEnabled"),
      prisma.submission.findFirst({
        where: {
          problemId,
          submissionType: "practice",
          userId: user.id,
        },
        select: { id: true },
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

  if (!problem || problem.archivedAt) notFound();
  const problemType = normalizeProblemType(problem.problemType);
  const objectiveItems =
    problemType === "objective"
      ? getPublicObjectiveItems(parseObjectiveItems(problem.objectiveItems))
      : [];
  const objectiveAiEnabled =
    problemType === "objective" &&
    boolSetting(objectiveAiMasterSetting) &&
    boolSetting(studentObjectiveAiSetting) &&
    Boolean(studentProfile?.objectiveAiAccessEnabled);
  const objectiveAiDisplay = getStudentObjectiveAiDisplayState({
    enabled: objectiveAiEnabled,
    hasPriorPracticeSubmission: Boolean(priorPracticeSubmission),
  });
  const objectiveAiLockedMessage = priorPracticeSubmission
    ? ""
    : "请先提交一次当前选择判断题";
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
    <>
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
      <ObjectiveAiExplanationProvider
        audited
        canForceRegenerate
        lockedMessage={objectiveAiLockedMessage}
        problemId={problem.id}
        requestPath={`/api/problems/${problem.id}/objective-explanation`}
      >
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
            <ObjectiveProblemContent
              items={objectiveItems}
              showAiExplanationActions={objectiveAiDisplay.showActions}
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

        {objectiveAiDisplay.showPanel ? (
          <aside className="grid content-start gap-4 xl:self-start">
            <ObjectiveAiExplanationPanel />
            <div className="grid content-start gap-3">
              <SubmitForm
                defaultCodeTemplate={defaultCodeTemplate}
                fromSubmissionId={
                  Number.isInteger(fromSubmissionId) ? fromSubmissionId : undefined
                }
                learningAssignmentId={
                  assignment?.status === "active" ? assignment.id : undefined
                }
                objectiveCompact
                problemType={problemType}
                problemId={problem.id}
                refreshShellOnAccepted
                refreshOnSuccess
                sampleCount={samples.length}
              />
            </div>
          </aside>
        ) : (
        <aside className="grid content-start gap-4 xl:self-start">
          <SubmitForm
            aiCooldownSeconds={aiCooldownSeconds ?? undefined}
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
            refreshShellOnAccepted
            refreshOnSuccess={problemType === "objective"}
            sampleCount={samples.length}
          />
        </aside>
        )}
      </div>
      </ObjectiveAiExplanationProvider>
    </>
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
