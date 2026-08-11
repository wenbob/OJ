// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock3, Target } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import {
  createAiProviderFingerprint,
  getEffectiveAiProviderConfig,
} from "@/lib/aiProvider";
import { isLearningWindow, type LearningWindow } from "@/lib/learningAnalytics";
import { prisma } from "@/lib/prisma";
import { getOrderedProblemCategories } from "@/lib/problemOrdering";
import {
  createTeacherInsightInput,
  hashTeacherInsightInput,
} from "@/lib/teacherLearningInsight";
import { getTeacherLearningStudentDetail } from "@/lib/teacherLearning";
import {
  getStaffBasePath,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { AssignmentBuilder } from "./assignment-builder";
import { AssignmentHistory } from "./assignment-history";
import { LearningInsightPanel } from "./learning-insight-panel";

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ window?: string | string[] }>;
};

export async function StaffStudentLearningPage({
  params,
  role,
  searchParams,
}: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const studentId = Number((await params).studentId);
  if (!Number.isInteger(studentId)) notFound();
  const rawWindow = (await searchParams).window;
  const selectedWindow = Array.isArray(rawWindow) ? rawWindow[0] : rawWindow;
  const window: LearningWindow = isLearningWindow(selectedWindow) ? selectedWindow : "30d";
  const detail = await getTeacherLearningStudentDetail(studentId, window);
  if (!detail) notFound();
  const categories = await getOrderedProblemCategories(
    prisma,
    "programming",
    detail.problems.map((problem) => problem.category),
  );
  const insightInput = createTeacherInsightInput({
    analytics: detail.analytics,
  });
  let currentHash: string | null = null;
  try {
    const aiProviderConfig = await getEffectiveAiProviderConfig("programming");
    currentHash = hashTeacherInsightInput(
      insightInput,
      createAiProviderFingerprint(aiProviderConfig),
    );
  } catch {
    // Rule-based diagnosis and assignment tools must stay available when the
    // optional AI provider configuration cannot be read.
  }
  const snapshot = await prisma.learningInsightSnapshot.findUnique({
    where: { studentId_window: { studentId, window } },
  });
  const initialSummary = snapshot?.summary ?? null;
  const initialStale = Boolean(
    snapshot && (currentHash === null || snapshot.inputHash !== currentHash),
  );
  const suggestedTitle = "课后练习";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link className="inline-flex items-center gap-2 text-sm font-black text-steel" href={`${basePath}/learning?window=${window}`}>
          <ArrowLeft size={16} /> 返回学情看板
        </Link>
        <div className="flex gap-2">
          {(["7d", "30d", "all"] as const).map((value) => (
            <Link className={`btn ${window === value ? "btn-primary" : "btn-secondary"}`} href={`${basePath}/learning/${studentId}?window=${value}`} key={value}>
              {value === "all" ? "全部" : value === "7d" ? "近 7 天" : "近 30 天"}
            </Link>
          ))}
        </div>
      </div>

      <section className="surface overflow-hidden">
        <div className="grid bg-ink-950 text-linen lg:grid-cols-[1fr_auto]">
          <div className="p-6 md:p-8">
            <p className="arena-kicker text-[#d7a062]">Student Diagnosis</p>
            <h1 className="mt-2 text-3xl font-black">{detail.student.username} 的学情</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {!detail.analytics.hasLearningData ? (
                <IssueTag label="尚未形成学情" />
              ) : detail.analytics.issueLabels.length ? (
                detail.analytics.issueLabels.map((label) => <IssueTag key={label} label={label} />)
              ) : (
                <span className="border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-200">训练状态稳定</span>
              )}
            </div>
          </div>
          <div className="grid min-w-80 grid-cols-2 border-t border-white/10 lg:border-l lg:border-t-0">
            <HeroStat label="周期提交" value={detail.analytics.summary.submissionCount} />
            <HeroStat label="周期唯一 AC" value={detail.analytics.summary.uniqueAcceptedInWindow} />
            <HeroStat label="累计待攻克" value={detail.analytics.summary.pendingProblemCount} />
            <HeroStat label="失败提交" value={detail.analytics.summary.failedSubmissionCount} />
          </div>
        </div>
      </section>

      {!detail.analytics.hasLearningData ? (
        <section className="surface mt-6 p-7 text-center">
          <Clock3 className="mx-auto text-steel" size={32} />
          <h2 className="mt-3 text-xl font-black">尚未形成学情</h2>
          <p className="mt-2 text-sm font-semibold text-ink-600">该学生还没有编程题提交。系统不会伪造薄弱分类或推荐结论。</p>
        </section>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="surface overflow-hidden">
            <SectionTitle kicker="Stuck Problems" title="持续卡题" />
            {detail.analytics.stuckProblems.length ? (
              <div className="divide-y divide-ink-950/10">
                {detail.analytics.stuckProblems.map((problem) => (
                  <Link className="arena-link-card flex items-center justify-between gap-4 p-4" href={`${basePath}/submissions/${problem.latestSubmissionId}`} key={problem.problemId}>
                    <span><b className="block text-sm text-ink-950">{problem.title}</b><span className="mt-1 block text-xs font-bold text-ink-600">{problem.category} · 最近一次通过后失败 {problem.failedAfterLastAccepted} 次</span></span>
                    <AlertTriangle className="text-amber-700" size={18} />
                  </Link>
                ))}
              </div>
            ) : <p className="p-5 text-sm font-semibold text-ink-600">当前没有连续失败至少 3 次的卡题。</p>}
          </section>

          <section className="surface overflow-hidden">
            <SectionTitle kicker="Recent Failures" title="最近失败题" />
            {detail.analytics.latestFailures.length ? (
              <div className="divide-y divide-ink-950/10">
                {detail.analytics.latestFailures.slice(0, 6).map((problem) => (
                  <Link className="arena-link-card flex items-center justify-between gap-4 p-4" href={`${basePath}/submissions/${problem.latestSubmissionId}`} key={problem.problemId}>
                    <span><b className="block text-sm text-ink-950">{problem.title}</b><span className="mt-1 block text-xs font-bold text-ink-600">{problem.category} · {formatDate(problem.latestSubmissionAt)}</span></span>
                    <StatusBadge status={problem.latestStatus} />
                  </Link>
                ))}
              </div>
            ) : <p className="p-5 text-sm font-semibold text-ink-600">暂无未解决的最近失败题。</p>}
          </section>
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <LearningInsightPanel
          initialGeneratedAt={snapshot?.generatedAt.toISOString() ?? null}
          initialStale={initialStale}
          initialSummary={initialSummary}
          studentId={studentId}
          window={window}
        />

        <section className="surface overflow-hidden">
          <div className="flex items-start gap-3 border-b border-ink-950/10 p-5">
            <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center bg-steel text-white">
              <Target size={18} />
            </span>
            <div>
              <p className="arena-kicker">Practice Picks</p>
              <h2 className="mt-1 text-xl font-black">推荐练习题</h2>
              <p className="mt-1 text-xs font-bold text-ink-600">优先选择待攻克题，再补充同类未尝试题。</p>
            </div>
          </div>
          {detail.recommendations.problems.length ? (
            <ol className="divide-y divide-ink-950/10">
              {detail.recommendations.problems.map((problem, index) => (
                <li className="flex items-center gap-3 p-4" key={problem.id}>
                  <span className="data-number grid h-8 w-8 flex-none place-items-center bg-ink-950 text-sm font-black text-linen">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-ink-950">{problem.title}</b>
                    <span className="mt-1 block text-[11px] font-bold text-ink-600">{problem.category} · {problem.reason === "pending" ? "待攻克错题" : "从未尝试"}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="p-6">
              <p className="text-sm font-black text-ink-800">当前没有自动推荐题目</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-ink-600">可以直接在下方搜索现有编程题，手动组成专项练习。</p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-6">
        <AssignmentBuilder
          activeProblemIds={detail.activeProblemIds}
          categories={categories}
          initialProblems={detail.recommendations.problems}
          studentId={studentId}
          suggestedTitle={suggestedTitle}
        />
      </div>
      <div className="mt-6">
        <AssignmentHistory
          activeProblemIds={detail.activeProblemIds}
          assignments={detail.assignments.map((assignment) => ({
            completedCount: assignment.progress.completedCount,
            canManage:
              role === "admin" || assignment.createdById === user.id,
            createdAt: assignment.createdAt.toISOString(),
            creatorName: assignment.createdBy?.username ?? "原账号已删除",
            dueAt: assignment.dueAt?.toISOString() ?? null,
            id: assignment.id,
            note: assignment.note ?? "",
            problemCount: assignment.progress.problemCount,
            problems: assignment.problems.map((problem) => ({
              category: problem.problemCategory,
              completedAt: problem.completedAt?.toISOString() ?? null,
              difficulty: problem.problemDifficulty,
              id: problem.id,
              problemId: problem.problemId,
              title: problem.problemTitle,
            })),
            status: assignment.status,
            title: assignment.title,
          }))}
          categories={categories}
        />
      </div>
    </>
  );
}

export default function AdminStudentLearningPage(props: PageProps) {
  return <StaffStudentLearningPage {...props} role="admin" />;
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return <div className="border-b border-ink-950/10 p-5"><p className="arena-kicker">{kicker}</p><h2 className="mt-1 text-xl font-black">{title}</h2></div>;
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return <div className="border-b border-r border-white/10 p-5"><p className="data-number text-3xl font-black text-[#f2d28c]">{value}</p><p className="mt-1 text-xs font-bold text-[#d7d0c2]">{label}</p></div>;
}

function IssueTag({ label }: { label: string }) {
  return <span className="border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-black text-amber-200">{label}</span>;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value);
}
