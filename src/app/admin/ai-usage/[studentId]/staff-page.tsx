// Shared server page for administrator and teacher shells.
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, BrainCircuit, Clock3, Database, GraduationCap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Pagination } from "@/components/Pagination";
import { aiUsageModeLabels, aiUsageStatusLabels, getAiUsageStudentDetail, readAiUsageFilters } from "@/lib/aiUsage";
import { parseObjectiveAiExplanationPayload } from "@/lib/objectiveAiExplanationPayload";
import { readPaginationFromObject } from "@/lib/pagination";
import {
  getStaffBasePath,
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

type PageProps = { params: Promise<{ studentId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function StaffAiUsageStudentPage({ params, role, searchParams }: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const studentId = Number((await params).studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) notFound();
  const rawParams = await searchParams;
  const filters = readAiUsageFilters(toUrlSearchParams(rawParams));
  const { page, pageSize } = readPaginationFromObject(rawParams);
  const detail = await getAiUsageStudentDetail({ filters, page, pageSize, studentId });
  if (!detail) notFound();

  return (
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="arena-kicker">AI Conversation Review</p><h1 className="mt-2 text-3xl font-black">{detail.student.username} · AI 对话</h1><p className="mt-2 text-sm font-semibold text-ink-600">精确查看学生在当前题目中的提问与 AI 最终回复，不包含代码或模型内部推理。</p></div>
        <div className="flex gap-2"><Link className="btn btn-secondary" href={`${basePath}/learning/${studentId}`}><BookOpen size={16} />查看学情</Link><Link className="btn btn-secondary" href={`${basePath}/ai-usage`}><ArrowLeft size={16} />返回总览</Link></div>
      </div>

      <section className="surface grid overflow-hidden bg-white/50 sm:grid-cols-2 xl:grid-cols-7">
        <Stat label="编程 AI" value={detail.student.aiAccessEnabled ? "已开通" : "未开通"} />
        <Stat label="选择判断 AI" value={detail.student.objectiveAiAccessEnabled ? "已开通" : "未开通"} />
        <Stat label="使用次数" value={detail.summary.usageCount} />
        <Stat label="模型调用" value={detail.summary.providerCallCount} />
        <Stat label="成功率" value={`${detail.summary.successRate}%`} />
        <Stat label="失败" value={detail.summary.failedCount} />
        <Stat label="Token" value={detail.summary.totalTokens === null ? "未返回" : new Intl.NumberFormat("zh-CN").format(detail.summary.totalTokens)} />
      </section>

      <form className="surface mt-7 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6" method="get">
        <Field label="时间"><select className="field" defaultValue={filters.window} name="window"><option value="today">今天</option><option value="7d">近 7 天</option><option value="30d">近 30 天</option><option value="all">全部</option><option value="custom">自定义</option></select></Field>
        <Field label="范围"><select className="field" defaultValue={filters.scope} name="scope"><option value="">全部</option><option value="practice">日常练习</option><option value="exam">考试</option></select></Field>
        <Field label="功能"><select className="field" defaultValue={filters.mode} name="mode"><option value="">全部</option><option value="overview">理解题目</option><option value="next_step">下一步提示</option><option value="code_review">检查代码</option><option value="question">自由提问</option><option value="objective_explanation">选择判断解析</option></select></Field>
        <Field label="状态"><select className="field" defaultValue={filters.status} name="status"><option value="">全部</option><option value="success">成功</option><option value="cached">缓存命中</option><option value="failed">失败</option><option value="interrupted">请求中断</option><option value="pending">处理中</option></select></Field>
        {filters.window === "custom" ? <><Field label="开始日期"><input className="field" defaultValue={filters.startDate} name="start" type="date" /></Field><Field label="结束日期"><input className="field" defaultValue={filters.endDate} name="end" type="date" /></Field></> : null}
        <button className="btn btn-primary self-end justify-center" type="submit">应用筛选</button>
      </form>

      <section className="surface mt-7 overflow-hidden">
        <div className="border-b border-ink-950/10 p-5"><p className="arena-kicker">Conversation Timeline</p><h2 className="mt-1 text-2xl font-black">问答时间线</h2></div>
        {detail.items.length === 0 ? <div className="p-10 text-center text-sm font-semibold text-ink-600">这个时间范围内没有 AI 使用记录。</div> : <div className="divide-y divide-ink-950/10">{detail.items.map((turn, index) => {
          const showConversationHeader = detail.items[index - 1]?.conversation.id !== turn.conversation.id;
          return <Fragment key={turn.id}>{showConversationHeader ? <div className="bg-ink-950/[0.04] px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-ink-950">{turn.conversation.problemTitle}</p><span className="text-xs font-bold text-ink-600">{turn.conversation.scope === "exam" ? `考试 · ${turn.conversation.examTitle || "历史考试"}` : "日常练习"}</span></div></div> : null}<article className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge label={aiUsageModeLabels[turn.mode] || turn.mode} tone="blue" /><Badge label={aiUsageStatusLabels[turn.status] || turn.status} tone={turn.status === "success" || turn.status === "cached" ? "green" : turn.status === "pending" ? "blue" : "red"} /></div><time className="text-xs font-bold text-ink-500">{formatDateTime(turn.createdAt)}</time></div><div className="mt-4 border-l-4 border-steel bg-steel/[0.06] p-4"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-steel">学生操作</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink-900">{turn.userContent}</p></div><details className="mt-3 border border-ink-950/10 bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-black text-ink-800">{turn.assistantContent ? "展开 AI 回复" : "查看失败原因"}</summary><div className="border-t border-ink-950/10 p-4"><AiTurnResponse aiProfile={turn.aiProfile} content={turn.assistantContent} errorMessage={turn.errorMessage} objectiveItemIndex={turn.objectiveItemIndex} /></div></details><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-bold text-ink-500"><span><Clock3 className="mr-1 inline" size={13} />{turn.latencyMs === null ? "耗时未知" : `${(turn.latencyMs / 1000).toFixed(1)} 秒`}</span><span><Database className="mr-1 inline" size={13} />模型调用 {turn.providerCallCount} 次</span><span><BrainCircuit className="mr-1 inline" size={13} />Token {turn.totalTokens ?? "未返回"}</span>{turn.model ? <span>模型 {turn.model}</span> : null}</div><div className="mt-4 flex flex-wrap gap-2">{turn.conversation.problemId ? <Link className="btn btn-secondary px-3 py-2" href={`${basePath}/practice/problems/${turn.conversation.problemId}`}><BookOpen size={14} />查看题目</Link> : null}{turn.conversation.examId ? <Link className="btn btn-secondary px-3 py-2" href={`${basePath}/exams/${turn.conversation.examId}/records`}><GraduationCap size={14} />考试记录</Link> : null}</div></article></Fragment>;
        })}</div>}
        <Pagination basePath={`${basePath}/ai-usage/${studentId}`} page={detail.page} pageSize={detail.pageSize} searchParams={rawParams} total={detail.total} totalPages={detail.totalPages} />
      </section>
    </AppShell>
  );
}

export default function AdminAiUsageStudentPage(props: PageProps) {
  return <StaffAiUsageStudentPage {...props} role="admin" />;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) { return <div className="border-b border-ink-950/10 p-4 sm:border-r xl:border-b-0"><p className="text-[11px] font-black text-ink-500">{label}</p><p className="data-number mt-2 text-2xl font-black text-ink-950">{value}</p></div>; }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="grid gap-2 text-xs font-black text-ink-700">{label}{children}</label>; }
function Badge({ label, tone }: { label: string; tone: "blue" | "green" | "red" }) { const style = tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "red" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-sky-200 bg-sky-50 text-sky-800"; return <span className={`border px-2 py-1 text-[11px] font-black ${style}`}>{label}</span>; }
function AiTurnResponse({ aiProfile, content, errorMessage, objectiveItemIndex }: { aiProfile: string; content: string | null; errorMessage: string | null; objectiveItemIndex: number | null }) { const payload = aiProfile === "objective" ? parseObjectiveAiExplanationPayload(content) : null; if (!payload) return <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-ink-800">{content || errorMessage || "尚未取得最终回复。"}</p>; return <div className="grid gap-3 text-sm font-semibold leading-6 text-ink-800"><p className="font-black text-emerald-700">第 {objectiveItemIndex ?? payload.itemIndex} 题 · 正确答案 {payload.correctAnswer}</p><p>{payload.overview}</p><div className="grid gap-2">{payload.options.map((option) => <div className="border border-ink-950/10 bg-white/70 p-3" key={option.label}><span className="font-black">{option.label} · {option.isCorrect ? "正确选项" : "错误选项"}</span><p className="mt-1">{option.explanation}</p></div>)}</div><p><span className="font-black">知识点：</span>{payload.takeaway}</p></div>; }
function formatDateTime(value: Date) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value); }
function toUrlSearchParams(values: Record<string, string | string[] | undefined>) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(values)) { const first = Array.isArray(value) ? value[0] : value; if (first) params.set(key, first); } return params; }
