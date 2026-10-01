"use client";

import { AcademyEmptyState } from "@/components/AcademyEmptyState";
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AnnouncementItem, AnnouncementList } from "@/lib/announcementShared";
import { notifyAnnouncementsUpdated } from "./AnnouncementNotifier";

async function requestJson(url: string, options?: RequestInit) {
  let response: Response;
  let body;
  try {
    response = await fetch(url, { cache: "no-store", ...options, signal: options?.signal ?? AbortSignal.timeout(15_000) });
    body = await response.json();
  } catch { throw new Error("网络异常，操作未确认，请重试"); }
  if (!response.ok) throw new Error(body.error ?? "公告操作失败，请重试");
  return body;
}
function DateLabel({ item }: { item: AnnouncementItem }) {
  return <p className="text-xs text-steel">{new Date(item.publishedAt).toLocaleString("zh-CN")} · {item.publisherName}</p>;
}
export function AnnouncementsPage({ role }: { role: "student" | "teacher" | "admin" }) {
  const admin = role === "admin";
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AnnouncementList | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [withdrawId, setWithdrawId] = useState<number | null>(null);
  const active = useRef(false);
  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await requestJson(`/api/${admin ? "admin/" : ""}announcements?page=${page}`, { signal });
      if (!signal?.aborted) { setData(result); setError(""); }
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "读取失败"); }
  }, [admin, page]);
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => { void reload(controller.signal); });
    const refresh = () => { void reload(controller.signal); };
    window.addEventListener("oj-announcements-updated", refresh);
    return () => { controller.abort(); cancelAnimationFrame(frame); window.removeEventListener("oj-announcements-updated", refresh); };
  }, [reload]);
  async function withdraw(id: number) {
    if (active.current) return;
    active.current = true; setBusyId(id); setError("");
    try {
      await requestJson(`/api/admin/announcements/${id}/withdraw`, { method: "POST" });
      setWithdrawId(null); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "撤下失败"); }
    finally { active.current = false; setBusyId(null); }
  }
  return <div className="space-y-6">
    <header><p className="arena-kicker">Announcements</p><PageHeading kind="announcement" className="mt-2 flex items-center gap-2">{admin ? "公告管理" : "公告"}</PageHeading>
      <p className="mt-3 text-sm text-steel">{admin ? "发布给所有学生和老师，确认一次后不再弹出。首页公告文字不受影响。" : "平台发布的通知保留在这里，已确认的公告也可随时回看。"}</p></header>
    {admin && <AnnouncementPublisher published={() => { setPage(1); if (page === 1) void reload(); }} />}
    <section className="surface p-5">
      <h2 className="text-xl font-black">历史公告</h2>
      {error && <p role="alert" className="mt-3 text-red-700">{error} <button className="underline" onClick={() => void reload()}>重试</button></p>}
      {!data && !error && <p className="py-5 text-steel">正在读取公告…</p>}
      {data?.items.length === 0 && <AcademyEmptyState compact icon="announcement" title="暂时没有公告" description={admin ? "发布后的公告会展示在这里。" : "有效公告会展示在这里。"} />}
      <div className="mt-4 divide-y divide-ink-950/10">
        {data?.items.map((item) => <article className="min-w-0 py-4" key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {admin ? <h3 className="break-words font-black">{item.title}</h3> : <Link className="min-w-0 break-words font-black text-clay underline" href={`/${role}/announcements/${item.id}`}>{item.title}</Link>}
            <span className="text-xs font-bold text-steel">{item.withdrawnAt ? "已撤下" : admin ? "已发布" : item.read ? "已读" : "未读"}</span>
          </div>
          <div className="mt-2"><DateLabel item={item} /></div>
          {admin && <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">查看正文</summary><p className="mt-3 whitespace-pre-wrap break-words leading-7">{item.body}</p></details>}
          {admin && !item.withdrawnAt && <div className="mt-3">
            {withdrawId === item.id ? <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-red-700">撤下后学生和老师将无法查看。</span>
              <button className="btn btn-secondary" disabled={busyId !== null} onClick={() => void withdraw(item.id)}>{busyId === item.id ? "正在撤下…" : "确认撤下"}</button>
              <button className="text-sm underline" disabled={busyId !== null} onClick={() => setWithdrawId(null)}>取消</button>
            </div> : <button className="text-sm font-bold text-steel underline" onClick={() => setWithdrawId(item.id)}>撤下公告</button>}
          </div>}
        </article>)}
      </div>
      {data && data.totalPages > 1 && <div className="mt-5 flex items-center justify-center gap-4">
        <button className="btn btn-secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>上一页</button>
        <span>{data.page} / {data.totalPages}</span>
        <button className="btn btn-secondary" disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)}>下一页</button>
      </div>}
    </section>
  </div>;
}

function AnnouncementPublisher({ published }: { published: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const key = useRef("");
  const inFlight = useRef(false);
  async function publish() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try {
      await requestJson("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, requestId: key.current }) });
      setTitle(""); setBody(""); setPreview(false); key.current = "";
      setSuccess("公告已发布，学生和老师将在普通页面收到提醒。"); published();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发布失败，请重试"); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section className="surface p-5">
    <h2 className="text-xl font-black">发布新公告</h2>
    {success && <p role="status" className="mt-3 text-sm text-steel">{success}</p>}
    <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault(); setError(""); setSuccess("");
      if (!title.trim() || !body.trim()) { setError("标题和正文不能为空"); return; }
      key.current ||= crypto.randomUUID(); setPreview(true);
    }}>
      <label className="block text-sm font-bold">公告标题
        <input className="field mt-2 font-normal" maxLength={100} required value={title} disabled={preview || pending}
          onChange={(event) => { setTitle(event.target.value); key.current = ""; }} />
      </label>
      <label className="block text-sm font-bold">公告正文
        <textarea className="field mt-2 min-h-48 font-normal leading-7" maxLength={5000} required value={body} disabled={preview || pending}
          onChange={(event) => { setBody(event.target.value); key.current = ""; }} />
      </label>
      <p className="text-xs text-steel">标题最多 100 字，正文最多 5000 字，支持换行。发布后不可直接修改，可撤下后单独发布新公告。</p>
      {!preview && <button className="btn btn-primary" type="submit">预览公告</button>}
    </form>
    {preview && <div className="mt-5 border border-clay/30 bg-[#fffaf1] p-4">
      <p className="text-xs font-bold text-clay">发布预览 · 所有学生和老师可见</p>
      <h3 className="mt-3 break-words text-xl font-black">{title}</h3>
      <p className="my-4 max-h-80 overflow-y-auto whitespace-pre-wrap break-words leading-7">{body}</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={pending} onClick={() => void publish()}>{pending ? "正在发布…" : "确认发布"}</button>
        <button className="btn btn-secondary" disabled={pending} onClick={() => setPreview(false)}>返回编辑</button>
      </div>
    </div>}
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
  </section>;
}

export function AnnouncementDetailPage({ role, id }: { role: "student" | "teacher"; id: string }) {
  const [item, setItem] = useState<AnnouncementItem | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await requestJson(`/api/announcements/${id}`, { signal });
      if (!signal?.aborted) { setItem(result); setError(""); }
    } catch (reason) { if (!signal?.aborted) { setItem(null); setError(reason instanceof Error ? reason.message : "读取失败"); } }
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => { void reload(controller.signal); });
    return () => { controller.abort(); cancelAnimationFrame(frame); };
  }, [reload]);
  async function acknowledge() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true);
    try {
      await requestJson(`/api/announcements/${id}/read`, { method: "POST" });
      await reload(); notifyAnnouncementsUpdated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "确认失败"); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section className="surface mx-auto max-w-3xl p-5 sm:p-8">
    <Link className="text-sm font-bold text-clay underline" href={`/${role}/announcements`}>返回公告列表</Link>
    {error && <p role="alert" className="mt-4 text-red-700">{error} <button className="underline" onClick={() => void reload()}>重试</button></p>}
    {!item && !error && <p className="py-8 text-steel">正在读取公告…</p>}
    {item && <>
      <PageHeading kind="announcement" className="my-4 break-words">{item.title}</PageHeading><DateLabel item={item} />
      <p className="my-6 whitespace-pre-wrap break-words leading-8">{item.body}</p>
      {item.read ? <p className="text-sm text-steel">已确认阅读</p> : <button className="btn btn-primary" disabled={pending} onClick={() => void acknowledge()}>{pending ? "正在确认…" : "我知道了"}</button>}
    </>}
  </section>;
}
