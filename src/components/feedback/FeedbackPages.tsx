import Image from "next/image";
import { notFound } from "next/navigation";
import { NavigationLink } from "@/components/NavigationLink";
import { Pagination } from "@/components/Pagination";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { FeedbackAdminActions } from "@/components/feedback/FeedbackAdminActions";
import { requirePageUser, type Role } from "@/lib/auth";
import { getFeedback, listFeedback } from "@/lib/feedback";
import { FeedbackError, feedbackId } from "@/lib/feedbackErrors";
import { feedbackStatusLabel } from "@/lib/feedbackShared";
import { formatDate } from "@/lib/format";

export type FeedbackSearchParams = Record<string, string | string[] | undefined>;

function Status({ status }: { status: string }) {
  return <span className={`shrink-0 border px-2 py-1 text-xs font-bold ${status === "resolved" ? "border-emerald-700/20 bg-emerald-50 text-emerald-800" : "border-amber-700/20 bg-amber-50 text-amber-900"}`}>{feedbackStatusLabel(status)}</span>;
}

function FeedbackUnavailable({ basePath, message }: { basePath: string; message: string }) {
  return <section className="surface space-y-4 p-6">
    <h1 className="text-2xl font-black">问题反馈</h1>
    <p role="alert" className="text-sm text-red-700">{message}</p>
    <NavigationLink href={basePath} className="btn btn-secondary">返回反馈列表</NavigationLink>
  </section>;
}

export async function FeedbackListPage({ role, searchParams }: { role: Role; searchParams: Promise<FeedbackSearchParams> }) {
  const user = await requirePageUser(role);
  const search = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["page", "status", "role", "q"]) {
    const value = search[key];
    if (value) params.set(key, Array.isArray(value) ? value[0] : value);
  }
  const basePath = `/${role}/feedback`;
  const isAdmin = role === "admin";
  let result: Awaited<ReturnType<typeof listFeedback>>;
  try {
    result = await listFeedback(user, params);
  } catch (error) {
    return <FeedbackUnavailable basePath={basePath} message={error instanceof FeedbackError ? error.message : "反馈暂时无法加载，请稍后重试。"} />;
  }
  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-black text-ink-950 md:text-3xl">问题反馈</h1>
      <p className="mt-2 text-sm leading-6 text-ink-600">{isAdmin ? "查看学生和老师遇到的问题，回复并跟进处理结果。" : "遇到系统问题？在这里告诉管理员，也可以查看处理进展。"}</p>
    </div>
    <div className={isAdmin ? "" : "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"}>
      {!isAdmin && <FeedbackForm basePath={basePath} />}
      <section className="surface min-w-0" aria-labelledby="feedback-list-title">
        <div className="border-b border-ink-950/10 p-5 md:p-7">
          <h2 id="feedback-list-title" className="text-xl font-black">{isAdmin ? "反馈管理" : "我的反馈"}</h2>
          {isAdmin && <form action={basePath} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto]">
            <div>
              <label htmlFor="feedback-status-filter" className="text-sm font-bold">处理状态</label>
              <select id="feedback-status-filter" className="field mt-2" name="status" defaultValue={params.get("status") || "pending"}>
                <option value="pending">待处理</option><option value="resolved">已处理</option><option value="all">全部状态</option>
              </select>
            </div>
            <div>
              <label htmlFor="feedback-role-filter" className="text-sm font-bold">提交人角色</label>
              <select id="feedback-role-filter" className="field mt-2" name="role" defaultValue={params.get("role") || "all"}>
                <option value="all">全部角色</option><option value="student">学生</option><option value="teacher">老师</option>
              </select>
            </div>
            <div>
              <label htmlFor="feedback-search" className="text-sm font-bold">搜索</label>
              <input id="feedback-search" className="field mt-2" name="q" maxLength={100} defaultValue={params.get("q") || ""} placeholder="用户名或反馈标题" />
            </div>
            <button className="btn btn-secondary self-end" type="submit">筛选</button>
          </form>}
        </div>
        {result.items.length ? <ul className="divide-y divide-ink-950/10">
          {result.items.map((item) => <li key={item.id}>
            <NavigationLink href={`${basePath}/${item.id}`} className="block p-5 transition-colors hover:bg-ink-950/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-steel md:px-7" contentClassName="w-full !flex-col !items-stretch" pendingLabel="正在加载反馈详情">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words font-bold text-ink-950 [overflow-wrap:anywhere]">{item.title}</span>
                <Status status={item.status} />
              </span>
              <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-ink-600">
                {isAdmin && <span className="break-all">{item.authorUsername} · {item.authorRole === "teacher" ? "老师" : "学生"}</span>}
                <time dateTime={item.createdAt.toISOString()}>{formatDate(item.createdAt)}</time>
                <span>{item._count.attachments} 张截图 · {item._count.replies} 条回复</span>
              </span>
            </NavigationLink>
          </li>)}
        </ul> : <p className="p-7 text-sm leading-7 text-ink-600">{isAdmin ? "当前条件下没有反馈。可以切换状态或调整搜索条件。" : "还没有提交反馈。提交后，你可以在这里查看原文和管理员回复。"}</p>}
        <Pagination basePath={basePath} searchParams={search} {...result.pagination} />
      </section>
    </div>
  </div>;
}

export async function FeedbackDetailPage({ role, params }: { role: Role; params: Promise<{ id: string }> }) {
  const user = await requirePageUser(role);
  const basePath = `/${role}/feedback`;
  let feedback: Awaited<ReturnType<typeof getFeedback>>;
  try {
    feedback = await getFeedback(user, feedbackId((await params).id));
  } catch (error) {
    if (error instanceof FeedbackError && error.status === 404) notFound();
    return <FeedbackUnavailable basePath={basePath} message="反馈暂时无法加载，请稍后重试。" />;
  }
  return <div className="mx-auto max-w-4xl space-y-6">
    <NavigationLink href={basePath} className="btn btn-secondary">返回反馈列表</NavigationLink>
    <article className="surface p-5 md:p-7">
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-600">
        <span>反馈 #{feedback.id}</span><Status status={feedback.status} />
      </div>
      <h1 className="mt-4 break-words text-2xl font-black leading-snug [overflow-wrap:anywhere]">{feedback.title}</h1>
      <p className="mt-3 break-all text-sm text-ink-600">{feedback.authorUsername} · {feedback.authorRole === "teacher" ? "老师" : "学生"} · {formatDate(feedback.createdAt)}</p>
      <div className="mt-6 whitespace-pre-wrap break-words border-t border-ink-950/10 pt-5 leading-8 [overflow-wrap:anywhere]">{feedback.content}</div>
      {feedback.attachments.length > 0 && <section className="mt-6" aria-labelledby="feedback-images-title">
        <h2 id="feedback-images-title" className="text-sm font-bold">截图（点击查看大图）</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {feedback.attachments.map((attachment, index) => {
            const url = `/api/feedback/${feedback.id}/attachments/${attachment.id}`;
            return <a key={attachment.id} href={url} target="_blank" rel="noopener noreferrer" className="block border border-ink-950/10 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-steel" aria-label={`查看截图 ${index + 1}（新窗口）`}>
              <div className="relative h-40 w-full">
                <Image unoptimized fill sizes="(max-width: 640px) 100vw, 280px" src={url} alt={`反馈截图 ${index + 1}`} className="object-contain" />
              </div>
            </a>;
          })}
        </div>
      </section>}
    </article>
    <section className="surface p-5 md:p-7" aria-labelledby="feedback-replies-title">
      <h2 id="feedback-replies-title" className="text-xl font-black">回复记录</h2>
      {feedback.replies.length ? <ol className="mt-5 divide-y divide-ink-950/10">
        {feedback.replies.map((reply) => <li key={reply.id} className="py-4 first:pt-0 last:pb-0">
          <p className="break-all text-sm font-bold text-steel">管理员 {reply.administratorUsername}<span className="ml-3 font-normal text-ink-600">{formatDate(reply.createdAt)}</span></p>
          <p className="mt-3 whitespace-pre-wrap break-words leading-8 [overflow-wrap:anywhere]">{reply.content}</p>
        </li>)}
      </ol> : <p className="mt-4 text-sm leading-6 text-ink-600">暂无回复。{role !== "admin" ? "管理员回复后会显示在这里。" : "可在下方填写处理结果。"}</p>}
    </section>
    {role === "admin" && <FeedbackAdminActions id={feedback.id} status={feedback.status} />}
  </div>;
}
