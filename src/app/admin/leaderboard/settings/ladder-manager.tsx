"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, History, Search, SlidersHorizontal } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AcademyEmptyState } from "@/components/AcademyEmptyState";
import { FilterButton } from "@/components/FilterChip";
import { PageHeading } from "@/components/PageHeading";
import { RankEmblem } from "@/components/RankEmblem";
import { UiBadge } from "@/components/UiBadge";
import { getRankTierTitle, isLadderPointValue, MAX_LADDER_POINTS, parsePointAdjustmentInput, POINT_ADJUSTMENT_MODE_LABELS, previewAdjustedPoints, validateTierThresholds, type LadderSettings, type PointAdjustmentMode } from "@/lib/ladderShared";
import type { getLadderStudentPage, getPointAdjustmentPage } from "@/lib/ladder";
import { AdjustmentRecords } from "./ladder-records";

export type LadderStudentPage = Awaited<ReturnType<typeof getLadderStudentPage>>;
export type AdjustmentPage = Awaited<ReturnType<typeof getPointAdjustmentPage>>;
type Student = LadderStudentPage["students"][number];
type Tab = "students" | "tiers" | "records";
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  let body;
  try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000), ...options }); body = await response.json(); }
  catch { throw new Error("网络异常，操作结果尚未确认。请重试，系统会防止重复调分。"); }
  if (!response.ok) throw new RequestError(body.error ?? "操作失败，请重试", response.status);
  return body as T;
}

export function LadderManager({ initialSettings, initialStudents, initialAdjustments }: {
  initialSettings: LadderSettings; initialStudents: LadderStudentPage; initialAdjustments: AdjustmentPage;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("students");
  const [settings, setSettings] = useState(initialSettings);
  const [thresholds, setThresholds] = useState(initialSettings.tiers.map((tier) => String(tier.minPoints)));
  const [students, setStudents] = useState(initialStudents);
  const [records, setRecords] = useState(initialAdjustments);
  const [studentQuery, setStudentQuery] = useState("");
  const [recordQuery, setRecordQuery] = useState("");
  const [recordMode, setRecordMode] = useState<PointAdjustmentMode | "">("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [mode, setMode] = useState<PointAdjustmentMode>("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [staleSettings, setStaleSettings] = useState(false);
  const activeMutation = useRef(false);
  const requestKey = useRef<{ payload: string; id: string } | null>(null);
  const loadGeneration = useRef(0);
  const amountField = useRef<HTMLInputElement>(null);

  async function loadStudents(page = students.page, query = students.query) {
    const generation = ++loadGeneration.current;
    setLoading(true); setError("");
    try {
      const data = await requestJson<LadderStudentPage>(`/api/admin/ladder/students?${new URLSearchParams({ page: String(page), q: query })}`);
      if (generation === loadGeneration.current) {
        setStudents(data);
        setSelected((current) => current ? data.students.find((student) => student.userId === current.userId) ?? null : null);
      }
    } catch (failure) { if (generation === loadGeneration.current) setError((failure as Error).message); }
    finally { if (generation === loadGeneration.current) setLoading(false); }
  }
  async function loadRecords(page = 1, query = recordQuery, filterMode = recordMode) {
    const generation = ++loadGeneration.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), q: query });
      if (filterMode) params.set("mode", filterMode);
      const data = await requestJson<AdjustmentPage>(`/api/admin/ladder/adjustments?${params}`);
      if (generation === loadGeneration.current) setRecords(data);
    } catch (failure) { if (generation === loadGeneration.current) setError((failure as Error).message); }
    finally { if (generation === loadGeneration.current) setLoading(false); }
  }
  async function reloadSettings() {
    if (activeMutation.current) return;
    setLoading(true); setError("");
    try {
      const data = await requestJson<LadderSettings>("/api/admin/ladder/settings");
      setSettings(data); setThresholds(data.tiers.map((tier) => String(tier.minPoints))); setStaleSettings(false);
      setNotice("已加载最新段位门槛"); await loadStudents();
    } catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }
  function chooseStudent(student: Student) {
    setSelected(student); setMode("add"); setAmount(""); setReason(""); setError(""); setNotice(""); requestKey.current = null;
    requestAnimationFrame(() => amountField.current?.focus());
  }
  async function saveAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || activeMutation.current) return;
    setError(""); setNotice("");
    const base = { mode, inputPoints: amount.trim() ? Number(amount) : NaN, expectedPoints: selected.points, reason: reason.trim() };
    const payload = JSON.stringify({ studentId: selected.userId, ...base });
    if (requestKey.current?.payload !== payload) requestKey.current = { payload, id: crypto.randomUUID() };
    let input;
    try { input = parsePointAdjustmentInput({ ...base, requestId: requestKey.current.id }); }
    catch (failure) { setError((failure as Error).message); return; }
    activeMutation.current = true; setSaving(true);
    try {
      const result = await requestJson<{ changed: boolean; replayed: boolean; ranking: Omit<Student, "adjustmentPoints"> | null }>(`/api/admin/ladder/students/${selected.userId}/adjustments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (result.ranking) setSelected({ ...result.ranking, adjustmentPoints: result.ranking.points - result.ranking.basePoints - result.ranking.rewardPoints });
      else setSelected(null);
      setAmount(""); setReason(""); requestKey.current = null;
      setNotice(result.replayed ? "该调分操作已保存，没有重复计分" : result.changed ? "调分已保存，积分与段位已更新" : "当前积分已是目标值，无需调整");
      await loadStudents(); router.refresh();
    } catch (failure) {
      if (failure instanceof RequestError && failure.status === 409) await loadStudents();
      setError((failure as Error).message);
    } finally { activeMutation.current = false; setSaving(false); }
  }
  async function saveThresholds(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeMutation.current || staleSettings) return;
    const values = thresholds.map((value) => value.trim() ? Number(value) : NaN);
    const validation = validateTierThresholds(values);
    if (validation) { setError(validation); return; }
    activeMutation.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const data = await requestJson<LadderSettings>("/api/admin/ladder/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: settings.revision, minPoints: values }) });
      setSettings(data); setThresholds(data.tiers.map((tier) => String(tier.minPoints))); setStaleSettings(false);
      setNotice("段位门槛已保存，三端重新加载后使用新规则"); await loadStudents(); router.refresh();
    } catch (failure) { setError((failure as Error).message); if (failure instanceof RequestError && failure.status === 409) setStaleSettings(true); }
    finally { activeMutation.current = false; setSaving(false); }
  }
  function switchTab(next: Tab) {
    if (saving) return;
    setTab(next); setError(""); setNotice("");
    if (next === "records") void loadRecords();
    if (next === "students") void loadStudents();
  }
  const numericAmount = amount.trim() ? Number(amount) : NaN;
  const preview = selected ? previewAdjustedPoints(selected.points, mode, numericAmount) : NaN;
  const validPreview = isLadderPointValue(preview);

  return <div className="ladder-management space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="arena-kicker">Ladder Management</p><PageHeading className="mt-2" kind="leaderboard">积分与段位设置</PageHeading><p className="mt-2 text-sm text-steel">管理学生积分、段位门槛和调分记录。</p></div>
      <Link className="btn btn-secondary" href="/admin/leaderboard"><ArrowLeft aria-hidden="true" size={16} />返回天梯榜</Link>
    </header>
    <nav aria-label="天梯管理功能" className="flex flex-wrap gap-2">
      <FilterButton active={tab === "students"} disabled={saving} onClick={() => switchTab("students")}><SlidersHorizontal aria-hidden="true" size={16} />学生积分</FilterButton>
      <FilterButton active={tab === "tiers"} disabled={saving} onClick={() => switchTab("tiers")}>段位门槛</FilterButton>
      <FilterButton active={tab === "records"} disabled={saving} onClick={() => switchTab("records")}><History aria-hidden="true" size={16} />调分记录</FilterButton>
    </nav>
    {notice ? <p className="rounded-[7px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p> : null}
    {error ? <p className="break-words rounded-[7px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p> : null}
    {tab === "students" ? <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-label="学生积分列表" aria-busy={loading} className="surface min-w-0 p-4 md:p-5">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setSelected(null); void loadStudents(1, studentQuery); }}>
          <label className="min-w-0 flex-1"><span className="sr-only">搜索学生</span><input className="field" maxLength={100} onChange={(event) => setStudentQuery(event.target.value)} placeholder="搜索学生用户名" value={studentQuery} /></label>
          <button className="btn btn-primary" disabled={loading || saving} type="submit"><Search aria-hidden="true" size={16} /><span className="sr-only sm:not-sr-only">搜索</span></button>
        </form>
        <p className="my-4 text-xs text-steel">共 {students.total} 名学生 · 做题积分 + 奖励积分 + 管理员调分</p>
        {students.students.length ? <div className="space-y-2">{students.students.map((student) => <article className={`ladder-manage-student rounded-[7px] border p-3 ${selected?.userId === student.userId ? "border-steel/40 bg-steel/10" : "border-ink-950/10 bg-white/40"}`} data-student-id={student.userId} key={student.userId}>
          <div className="flex min-w-0 items-center gap-3"><RankEmblem className="rank-emblem-sm" tierTitle={student.tierTitle} /><div className="min-w-0 flex-1"><h2 className="truncate font-bold" title={student.username}>{student.username}</h2><p className="text-xs text-steel">{student.tierTitle}</p></div><strong className="data-number flex-none text-lg">{student.points}<span className="ml-1 text-xs font-medium text-steel">分</span></strong></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words text-xs leading-5 text-ink-600">做题 {student.basePoints} · 奖励 {student.rewardPoints} · 调分 {student.adjustmentPoints > 0 ? "+" : ""}{student.adjustmentPoints}</p><button aria-label={`调整 ${student.username} 的积分`} className="btn btn-secondary text-xs" disabled={saving || loading} onClick={() => chooseStudent(student)} type="button">调分<ArrowRight aria-hidden="true" size={14} /></button></div>
        </article>)}</div> : <AcademyEmptyState compact title="没有匹配的学生" description="尝试其他用户名，或在账号管理中新增学生。" />}
        <LadderPager data={students} disabled={loading || saving} change={(page) => void loadStudents(page)} />
      </section>
      <section aria-label="调整学生积分" className="surface min-w-0 p-5 xl:sticky xl:top-5">
        <PageHeading as="h2" size="section">调整学生积分</PageHeading>
        {selected ? <form className="mt-5 space-y-4" onSubmit={saveAdjustment}>
          <div className="flex min-w-0 items-center gap-3"><RankEmblem className="rank-emblem-sm" tierTitle={selected.tierTitle} /><div className="min-w-0"><p className="break-words font-bold">{selected.username}</p><p className="text-xs text-steel">当前 {selected.points} 分 · {selected.tierTitle}</p></div></div>
          <div><label className="block text-sm font-semibold" htmlFor="ladder-adjustment-mode">操作类型</label><select className="field mt-2" disabled={saving} id="ladder-adjustment-mode" onChange={(event) => setMode(event.target.value as PointAdjustmentMode)} value={mode}>{Object.entries(POINT_ADJUSTMENT_MODE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <label className="block text-sm font-semibold">{mode === "set" ? "目标总积分" : mode === "deduct" ? "扣除积分" : "增加积分"}<input className="field mt-2" disabled={saving} inputMode="numeric" max={MAX_LADDER_POINTS} min={mode === "set" ? 0 : 1} onChange={(event) => setAmount(event.target.value)} ref={amountField} required step={1} type="number" value={amount} /></label>
          <div className="rounded-[7px] border border-steel/20 bg-steel/5 p-3 text-sm" aria-live="polite"><p className="data-number font-bold">{selected.points} → {validPreview ? preview : "—"} 分</p><p className="mt-1 text-xs text-steel">{selected.tierTitle} → {validPreview ? getRankTierTitle(preview, students.tiers) : "请输入有效积分"}</p>{Number.isFinite(preview) && preview < 0 ? <p className="mt-2 text-xs text-red-700">扣分后总积分不能低于 0</p> : null}</div>
          <div><label className="block text-sm font-semibold" htmlFor="ladder-point-reason">调分理由</label><textarea className="field mt-2 resize-y" disabled={saving} id="ladder-point-reason" maxLength={400} onChange={(event) => setReason(event.target.value)} placeholder="例如：课堂挑战奖励、积分纠错" required rows={3} value={reason} /></div>
          <p className="text-xs leading-5 text-steel">理由需填写 1～200 字，仅管理员可见。已保存的记录不能修改，纠错请另做一次反向调分。</p>
          <button className="btn btn-primary w-full" disabled={saving || loading || !validPreview} type="submit"><Check aria-hidden="true" size={16} />{saving ? "正在保存…" : "保存调分"}</button>
        </form> : <p className="mt-5 text-sm leading-6 text-steel">选择一名学生，查看调整预览并填写理由。</p>}
      </section>
    </div> : null}
    {tab === "tiers" ? <section aria-label="段位门槛设置" className="surface p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><PageHeading as="h2" size="section">段位门槛</PageHeading><p className="mt-2 text-sm text-steel">青铜固定为 0，其余门槛按顺序递增。调整门槛会重新计算段位，不改变积分。</p></div><button className="btn btn-secondary text-sm" disabled={saving || loading} onClick={() => void reloadSettings()} type="button">重新加载门槛</button></div>
      <form className="mt-6" onSubmit={saveThresholds}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{settings.tiers.map((tier, index) => <div className="min-w-0 rounded-[12px] border border-ink-950/10 bg-white/60 p-4" key={tier.key}>
          <div className="flex items-center gap-3"><RankEmblem className="rank-emblem-path" tierTitle={tier.title} /><div className="min-w-0"><h3 className="text-sm font-bold">{tier.title}</h3><p className="mt-1 text-xs text-steel">第 {index + 1} 阶</p></div></div>
          <label className="mt-4 block text-xs font-semibold text-steel">{tier.title}最低积分<input className="field mt-2 text-base text-ink-950" disabled={index === 0 || saving} inputMode="numeric" max={MAX_LADDER_POINTS} min={index === 0 ? 0 : 1} onChange={(event) => setThresholds((current) => current.map((value, position) => position === index ? event.target.value : value))} required step={1} type="number" value={thresholds[index]} /></label>
        </div>)}</div>
        <div className="mt-6 flex flex-wrap items-center gap-4"><button className="btn btn-primary" disabled={saving || loading || staleSettings} type="submit">{saving ? "正在保存…" : "保存段位门槛"}</button><UiBadge tone="neutral">每首次通过新题仍为 10 分</UiBadge></div>
      </form>
    </section> : null}
    {tab === "records" ? <section aria-label="管理员调分记录" aria-busy={loading} className="surface min-w-0 p-4 md:p-5">
      <PageHeading as="h2" size="section">调分记录</PageHeading>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void loadRecords(); }}>
        <label className="min-w-0 flex-1 basis-40"><span className="sr-only">搜索记录中的学生</span><input className="field" maxLength={100} onChange={(event) => setRecordQuery(event.target.value)} placeholder="搜索学生用户名" value={recordQuery} /></label>
        <div><label className="sr-only" htmlFor="ladder-record-mode">筛选操作类型</label><select className="field" id="ladder-record-mode" onChange={(event) => setRecordMode(event.target.value as PointAdjustmentMode | "")} value={recordMode}><option value="">全部操作</option>{Object.entries(POINT_ADJUSTMENT_MODE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <button className="btn btn-primary" disabled={loading} type="submit">筛选记录</button>
      </form>
      <AdjustmentRecords records={records.records} />
      <LadderPager data={records} disabled={loading} change={(page) => void loadRecords(page, records.query, records.mode)} />
    </section> : null}
  </div>;
}

export function LadderPager({ data, disabled, change }: { data: { page: number; totalPages: number; total: number }; disabled: boolean; change: (page: number) => void }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-950/10 pt-4 text-xs text-steel"><span>共 {data.total} 条 · 第 {data.page} / {data.totalPages} 页</span><div className="flex gap-2"><button className="btn btn-secondary text-xs" disabled={disabled || data.page <= 1} onClick={() => change(data.page - 1)} type="button">上一页</button><button className="btn btn-secondary text-xs" disabled={disabled || data.page >= data.totalPages} onClick={() => change(data.page + 1)} type="button">下一页</button></div></div>;
}
