import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CopyProblemButton } from "@/components/CopyProblemButton";
import { ObjectiveProblemContent } from "@/components/ObjectiveProblemContent";
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
  searchParams: Promise<{ problemId?: string | string[] }>;
};

export default async function AdminExamPracticePage({
  params,
  searchParams,
}: PageProps) {
  const user = await requirePageUser("admin");
  const { id } = await params;
  const query = await searchParams;
  const examId = Number(id);
  const requestedProblemId = Number(
    Array.isArray(query.problemId) ? query.problemId[0] : query.problemId,
  );
  if (!Number.isInteger(examId)) notFound();

  const [exam, defaultCodeTemplate] = await Promise.all([
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
    getDefaultCppTemplate(),
  ]);

  if (!exam) notFound();

  const problemIds = exam.problems.map((item) => item.problemId);
  const latestSubmissions =
    problemIds.length > 0
      ? await prisma.submission.findMany({
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
        })
      : [];

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

  return (
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
            Exam Practice
          </p>
          <h1 className="mt-2 text-2xl font-black">{exam.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ProblemTypeBadge type={exam.examType} />
            <p className="text-sm font-semibold text-ink-600">
              管理员练习模式：不限时，不需要交卷，提交记录计入日常提交。
            </p>
          </div>
        </div>
        <Link className="btn btn-secondary" href="/admin/exams">
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
                  const active = item.problemId === selectedProblem.id;
                  return (
                    <Link
                      className={`block p-4 hover:bg-white/70 ${
                        active ? "bg-white/75" : ""
                      }`}
                      href={`/admin/exams/${exam.id}/practice?problemId=${item.problemId}`}
                      key={item.id}
                    >
                      <p className="text-xs font-black text-ink-500">
                        第 {index + 1} 题
                      </p>
                      <h3 className="mt-1 font-black">{item.problem.title}</h3>
                      <p className="mt-1 text-xs font-bold text-ink-600">
                        {item.problem.category || "未分类"} / {item.score} 分
                      </p>
                      <div className="mt-3">
                        {latest ? (
                          <StatusBadge status={latest.status} />
                        ) : (
                          <span className="inline-flex border border-ink-950/10 bg-white/70 px-2.5 py-1 text-xs font-bold text-ink-600">
                            未提交
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </aside>
          ) : null}

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
              <ProblemSection title="题目描述" value={selectedProblem.description} />
              {selectedProblemType === "objective" ? (
                <ObjectiveProblemContent items={objectiveItems} showAnswers />
              ) : (
                <>
                  <ProblemSection title="输入格式" value={selectedProblem.inputDescription} />
                  <ProblemSection title="输出格式" value={selectedProblem.outputDescription} />
                  <ProblemSamples samples={samples} />
                  <ProblemSection title="数据范围" value={selectedProblem.dataRange || "暂无"} />
                </>
              )}
            </article>

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
                          href={`/admin/submissions/${selectedLatest.id}`}
                        >
                          查看提交详情
                        </Link>
                      </>
                    )}
                  </div>
                </section>
              ) : null}
              <ProblemSubmitForm
                key={`admin-exam-practice-${exam.id}-problem-${selectedProblem.id}`}
                defaultCodeTemplate={defaultCodeTemplate}
                detailHrefBase="/admin/submissions"
                draftStorageKey={`oj-code-admin-exam-practice-${exam.id}-problem-${selectedProblem.id}`}
                problemType={selectedProblemType}
                problemId={selectedProblem.id}
                refreshOnSuccess
                sampleCount={samples.length}
              />
            </aside>
          </div>
        </div>
      ) : (
        <section className="surface p-10 text-center text-sm font-semibold text-ink-600">
          该考试暂未添加题目。
        </section>
      )}
    </AppShell>
  );
}

function ProblemSection({ title, value }: { title: string; value: string }) {
  return (
    <section className="mt-8">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 whitespace-pre-wrap leading-7 text-ink-800">{value}</p>
    </section>
  );
}
