// Shared server page for administrator and teacher shells.
import Link from "next/link";
import {
  Activity,
  BrainCircuit,
  Clock3,
  Database,
  Gauge,
  Users,
} from "lucide-react";
import { getAiUsageDashboard, readAiUsageFilters } from "@/lib/aiUsage";
import {
  getStaffBasePath,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function StaffAiUsagePage({
  role,
  searchParams,
}: PageProps & { role: StaffRole }) {
  await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const rawParams = await searchParams;
  const filters = readAiUsageFilters(toUrlSearchParams(rawParams));
  const dashboard = await getAiUsageDashboard(filters);
  const maxHour = Math.max(1, ...dashboard.hourly.map((item) => item.count));

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="grid bg-ink-950 text-linen lg:grid-cols-[1fr_auto]">
          <div className="p-6 md:p-8">
            <p className="arena-kicker text-[#d7a062]">AI Learning Audit</p>
            <h1 className="mt-2 text-3xl font-black">AI 使用与对话</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#d7d0c2]">
              查看学生何时使用 AI、实际调用量与问答内容。系统只保存学生可见问答，不保存代码和模型内部推理。
            </p>
          </div>
          <WindowTabs basePath={basePath} filters={filters} />
        </div>
        <div className="grid bg-white/45 sm:grid-cols-2 xl:grid-cols-6">
          <OverviewStat icon={<BrainCircuit size={17} />} label="学生使用" value={dashboard.summary.usageCount} />
          <OverviewStat icon={<Database size={17} />} label="模型调用" value={dashboard.summary.providerCallCount} />
          <OverviewStat icon={<Users size={17} />} label="活跃学生" value={dashboard.activeStudentCount} />
          <OverviewStat icon={<Gauge size={17} />} label="成功率" value={`${dashboard.summary.successRate}%`} />
          <OverviewStat icon={<Activity size={17} />} label="缓存命中" value={dashboard.summary.cachedCount} />
          <OverviewStat icon={<Clock3 size={17} />} label="Token" value={formatTokens(dashboard.summary.totalTokens)} />
        </div>
      </section>

      <FilterPanel filters={filters} />

      <section className="surface mt-7 overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <p className="arena-kicker">Today by Hour</p>
          <h2 className="mt-1 text-2xl font-black">今日使用时段</h2>
          <p className="mt-2 text-xs font-bold text-ink-600">按北京时间统计进入 AI 处理的请求。</p>
        </div>
        <div className="grid grid-cols-12 gap-1 px-4 py-6 sm:grid-cols-[repeat(24,minmax(0,1fr))] sm:gap-2">
          {dashboard.hourly.map((item) => (
            <div className="flex min-h-36 flex-col justify-end" key={item.hour} title={`${item.hour}:00 · ${item.count} 次`}>
              <span className="mb-1 text-center text-[10px] font-black text-steel">{item.count || ""}</span>
              <span
                className="block min-h-1 bg-steel transition-[height]"
                style={{ height: `${Math.max(4, (item.count / maxHour) * 92)}px` }}
              />
              <span className="mt-2 text-center text-[9px] font-bold text-ink-500">
                {item.hour % 2 === 0 ? String(item.hour).padStart(2, "0") : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="surface mt-7 overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <p className="arena-kicker">Student Usage</p>
          <h2 className="mt-1 text-2xl font-black">全部学生</h2>
          <p className="mt-2 text-xs font-bold text-ink-600">未使用 AI 的学生也会保留在列表中。</p>
        </div>
        {dashboard.rows.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-ink-600">没有符合筛选条件的学生。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-ink-950/[0.04] text-xs font-black text-ink-600">
                <tr>
                  <th className="px-5 py-3">学生</th><th className="px-3 py-3">AI 权限</th><th className="px-3 py-3">使用</th>
                  <th className="px-3 py-3">成功 / 缓存 / 失败</th><th className="px-3 py-3">模型调用</th>
                  <th className="px-3 py-3">Token</th><th className="px-3 py-3">最后使用</th><th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-950/10">
                {dashboard.rows.map((row) => (
                  <tr className="hover:bg-steel/[0.04]" key={row.student.id}>
                    <td className="px-5 py-4 font-black text-ink-950">{row.student.username}</td>
                    <td className="px-3 py-4"><div className="grid gap-1"><StatusPill good={row.student.aiAccessEnabled} label={`编程 ${row.student.aiAccessEnabled ? "开" : "关"}`} /><StatusPill good={row.student.objectiveAiAccessEnabled} label={`选择判断 ${row.student.objectiveAiAccessEnabled ? "开" : "关"}`} /></div></td>
                    <td className="data-number px-3 py-4 font-black">{row.usageCount}</td>
                    <td className="px-3 py-4 font-bold text-ink-700">{row.successCount} / {row.cachedCount} / {row.failedCount}</td>
                    <td className="data-number px-3 py-4 font-bold">{row.providerCallCount}</td>
                    <td className="data-number px-3 py-4 font-bold">{formatTokens(row.totalTokens)}</td>
                    <td className="px-3 py-4 text-xs font-bold text-ink-600">{row.lastUsedAt ? formatDateTime(row.lastUsedAt) : "尚未使用"}</td>
                    <td className="px-5 py-4 text-right">
                      <Link className="btn btn-secondary px-3 py-2" href={studentDetailHref(basePath, row.student.id, rawParams)}>查看对话</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function FilterPanel({ filters }: { filters: ReturnType<typeof readAiUsageFilters> }) {
  return (
    <form className="surface mt-7 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6" method="get">
      <input name="window" type="hidden" value={filters.window} />
      <Field label="学生名"><input className="field" defaultValue={filters.query} name="q" placeholder="留空查看全部" /></Field>
      <Field label="范围"><select className="field" defaultValue={filters.scope} name="scope"><option value="">全部</option><option value="practice">日常练习</option><option value="exam">考试</option></select></Field>
      <Field label="功能"><select className="field" defaultValue={filters.mode} name="mode"><option value="">全部</option><option value="overview">理解题目</option><option value="next_step">下一步提示</option><option value="code_review">检查代码</option><option value="question">自由提问</option><option value="objective_explanation">选择判断解析</option></select></Field>
      <Field label="状态"><select className="field" defaultValue={filters.status} name="status"><option value="">全部</option><option value="success">成功</option><option value="cached">缓存命中</option><option value="failed">失败</option><option value="interrupted">请求中断</option><option value="pending">处理中</option></select></Field>
      {filters.window === "custom" ? <><Field label="开始日期"><input className="field" defaultValue={filters.startDate} name="start" type="date" /></Field><Field label="结束日期"><input className="field" defaultValue={filters.endDate} name="end" type="date" /></Field></> : null}
      <button className="btn btn-primary self-end justify-center" type="submit">应用筛选</button>
    </form>
  );
}

function WindowTabs({ basePath, filters }: { basePath: string; filters: ReturnType<typeof readAiUsageFilters> }) {
  return <div className="flex items-center border-t border-white/10 p-5 lg:border-l lg:border-t-0"><div className="flex flex-wrap gap-2">{(["today", "7d", "30d", "all", "custom"] as const).map((value) => <Link className={`btn ${filters.window === value ? "border-[#d6a44a] bg-[#d6a44a] text-ink-950" : "border-white/15 bg-white/5 text-linen"}`} href={`${basePath}/ai-usage?window=${value}`} key={value}>{value === "today" ? "今天" : value === "7d" ? "近 7 天" : value === "30d" ? "近 30 天" : value === "all" ? "全部" : "自定义"}</Link>)}</div></div>;
}

function OverviewStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) { return <div className="border-b border-ink-950/10 p-4 sm:border-r xl:border-b-0"><div className="flex items-center gap-2 text-steel">{icon}<span className="text-[11px] font-black text-ink-600">{label}</span></div><p className="data-number mt-2 text-2xl font-black text-ink-950">{value}</p></div>; }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="grid gap-2 text-xs font-black text-ink-700">{label}{children}</label>; }
function StatusPill({ good, label }: { good: boolean; label: string }) { return <span className={`inline-flex border px-2 py-1 text-[11px] font-black ${good ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-ink-950/10 bg-stone-100 text-ink-600"}`}>{label}</span>; }
function formatTokens(value: number | null) { return value === null ? "未返回" : new Intl.NumberFormat("zh-CN").format(value); }
function formatDateTime(value: Date) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value); }
function toUrlSearchParams(values: Record<string, string | string[] | undefined>) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(values)) { const first = Array.isArray(value) ? value[0] : value; if (first) params.set(key, first); } return params; }
function studentDetailHref(basePath: string, studentId: number, values: Record<string, string | string[] | undefined>) { const params = toUrlSearchParams(values); params.delete("studentId"); params.delete("q"); const query = params.toString(); return `${basePath}/ai-usage/${studentId}${query ? `?${query}` : ""}`; }

export default function AdminAiUsagePage(props: PageProps) {
  return <StaffAiUsagePage {...props} role="admin" />;
}
