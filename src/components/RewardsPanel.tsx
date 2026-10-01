"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BadgeCheck, Gift, LoaderCircle, Sparkles, X } from "lucide-react";
import { AcademyIllustration } from "@/components/AcademyIllustration";
import { AcademyEmptyState } from "@/components/AcademyEmptyState";
import { PageHeading } from "@/components/PageHeading";
import { useAutomaticOverlay } from "@/lib/automaticOverlay";
import type { RewardChallengeView, RewardsResponse, RewardSubmissionUpdate, RewardView } from "@/lib/rewardShared";

const updatedEvent = "oj-rewards-updated";
function useRewards(query = "") {
  const [data, setData] = useState<RewardsResponse | null>(null);
  const [error, setError] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/rewards${query}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "读取奖励失败");
      if (!signal?.aborted) { setData(body); setServerOffset(Date.parse(body.serverNow) - Date.now()); setError(""); }
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "读取奖励失败");
    }
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => { void reload(controller.signal); });
    const refresh = () => { void reload(controller.signal); };
    window.addEventListener(updatedEvent, refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { controller.abort(); cancelAnimationFrame(frame); clearInterval(timer); window.removeEventListener(updatedEvent, refresh); };
  }, [reload]);
  return { data, error, reload, setData, serverOffset };
}

function useRewardClock(serverOffset: number) {
  const [localNow, setLocalNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setLocalNow(Date.now());
    const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  return localNow + serverOffset;
}

function formatRemaining(seconds: number) {
  return `${Math.floor(seconds / 3600)}小时 ${Math.floor(seconds / 60) % 60}分 ${seconds % 60}秒`;
}

export function RewardChallengeCard({ challenge, serverOffset = 0 }: { challenge: RewardChallengeView; serverOffset?: number }) {
  const now = useRewardClock(serverOffset);
  const seconds = Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000));
  const remaining = formatRemaining(seconds);
  return <div className="rounded-xl border border-clay/30 bg-[#fff8ec] p-4">
    <p className="font-black text-ink-950">翻倍挑战 · 再得 {challenge.amount} 分</p>
    <p className="mt-2 break-words font-bold">{challenge.targetTitle}</p>
    <p className="my-2 text-sm text-steel">{seconds ? `剩余 ${remaining}` : "挑战已到期；限时内提交的答案仍以最终评测结果为准"}</p>
    {seconds > 0 && <Link className="btn btn-primary inline-flex" href={`/student/problems/${challenge.targetProblemId}`}>进入挑战题</Link>}
  </div>;
}

function RewardCard({ reward, blocked, changed, serverOffset }: { reward: RewardView; blocked: boolean; changed: () => void; serverOffset: number }) {
  const router = useRouter();
  const now = useRewardClock(serverOffset);
  const offerSeconds = reward.offerExpiresAt ? Math.max(0, Math.ceil((Date.parse(reward.offerExpiresAt) - now) / 1000)) : 0;
  const offerExpired = reward.offerStatus === "expired" || offerSeconds === 0;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const requestInFlight = useRef(false);
  async function act(action: "draw" | "challenge") {
    if (requestInFlight.current) return;
    requestInFlight.current = true; setPending(true); setError("");
    try {
      const response = await fetch(`/api/rewards/${reward.id}/${action}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "奖励操作失败");
      changed(); window.dispatchEvent(new Event(updatedEvent)); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "网络异常，请重试"); }
    finally { requestInFlight.current = false; setPending(false); }
  }
  const challenge = reward.challenge;
  return <article className="min-w-0 rounded-xl border border-ink-950/10 bg-white p-4">
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-steel">
      {reward.amount === null ? <AcademyIllustration className="academy-illustration-sm" kind="reward" /> : <BadgeCheck aria-hidden="true" className="text-emerald-700" size={23} />}
      <span>{reward.amount === null ? "新题首次通过 · 奖励待领取" : "已领取的通过奖励"}</span>
    </div>
    <p className="break-words font-bold">{reward.problemTitle}</p>
    <p className="mt-1 text-xs text-steel">{new Date(reward.createdAt).toLocaleString("zh-CN")}</p>
    {reward.amount === null ? <>
      <p className="my-4 text-sm">首次通过奖励：随机 <strong>{reward.minPoints}～{reward.maxPoints}</strong> 积分</p>
      <button className="btn btn-primary" disabled={pending || blocked} onClick={() => void act("draw")}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Gift aria-hidden="true" size={16} />}{pending ? "抽奖中…" : "开始抽奖"}</button>
    </> : <>
      <p className="reward-points-reveal my-3 text-3xl font-bold text-clay">+{reward.amount}<span className="ml-2 text-sm font-medium text-steel">积分已计入天梯</span></p>
      {!challenge || challenge.status === "cancelled" ? <>
        {offerExpired ? <p className="text-sm font-bold text-steel">翻倍机会已过期，原奖励积分保留</p> : <>
          <p className="mb-3 text-sm leading-6 text-steel">{challenge?.status === "cancelled" ? "原挑战题已下架，从下架时起重新给予 24 小时接受机会。" : "抽奖后 24 小时内可接受翻倍挑战。"}接受一道同类型、同分类的随机新题后，另有 24 小时完成，通过再得 {reward.amount} 分。</p>
          <p className="mb-3 text-sm font-bold text-clay">接受挑战剩余时间：{formatRemaining(offerSeconds)}</p>
          <button className="btn btn-primary" disabled={pending || blocked} onClick={() => void act("challenge")}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Sparkles aria-hidden="true" size={16} />}{pending ? "正在选题…" : "接受翻倍挑战"}</button>
        </>}
      </> : challenge.status === "active" ? <RewardChallengeCard challenge={challenge} serverOffset={serverOffset} />
        : <p className="text-sm font-bold text-steel">{challenge.status === "completed" ? `翻倍成功，已额外获得 ${reward.amount} 分` : "挑战已超时，原奖励积分保留"}</p>}
    </>}
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </article>;
}

export function RewardsPanel({ rewardId }: { rewardId?: number }) {
  const [page, setPage] = useState(1);
  const { data, error, reload, serverOffset } = useRewards(rewardId ? `?rewardId=${rewardId}` : `?page=${page}`);
  return <section id="my-rewards" className={rewardId ? "" : "surface my-6 p-5"}>
    {!rewardId && <div className="flex min-w-0 items-center justify-between gap-4"><div className="min-w-0"><p className="arena-kicker">Practice Rewards</p><PageHeading kind="reward" className="mt-2">我的奖励</PageHeading></div><AcademyIllustration eager className="academy-illustration-heading" kind="reward" /></div>}
    {error && <p className="my-3 text-red-700" role="alert">{error} <button className="underline" onClick={() => void reload()}>重试</button></p>}
    {!data && !error && <p className="py-4 text-sm text-steel">正在读取奖励…</p>}
    {data && <>
      {!rewardId && <p className="my-3 text-sm text-steel">累计奖励 {data.rewardPoints} 分 · 待抽奖 {data.pendingDrawCount} 次。未抽奖机会保留；抽奖后须在 24 小时内接受翻倍挑战，接受后另有 24 小时完成。</p>}
      {data.blockedByExam && <p className="my-3 text-sm text-clay">考试期间不能抽奖或接受挑战，请交卷后继续。</p>}
      {!rewardId && data.currentChallenge && <div className="mb-4"><RewardChallengeCard challenge={data.currentChallenge} serverOffset={serverOffset} /></div>}
      <div className={rewardId ? "grid gap-3" : "grid gap-3 md:grid-cols-2"}>
        {data.rewards.map((reward) => <RewardCard key={reward.id} reward={reward} blocked={data.blockedByExam} changed={() => void reload()} serverOffset={serverOffset} />)}
      </div>
      {!data.rewards.length && <AcademyEmptyState kind="reward" title="第一份奖励，等你来解锁" description="首次通过一道新的日常练习题，即可获得抽奖机会。" href={data.blockedByExam ? undefined : "/student/problems"} action="去挑战一道新题" />}
      {!rewardId && data.totalPages > 1 && <div className="mt-4 flex items-center justify-center gap-4">
        <button className="btn btn-secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>上一页</button>
        <span>{data.page} / {data.totalPages}</span>
        <button className="btn btn-secondary" disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)}>下一页</button>
      </div>}
    </>}
  </section>;
}

function RewardDialog({ rewardId, doubledPoints, close }: { rewardId?: number; doubledPoints: number; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []);
      if (!items.length) { event.preventDefault(); return; }
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && (index === items.length - 1 || index === -1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [close]);
  return createPortal(<div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/40 p-4">
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reward-dialog-title" className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#fffdf8] p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 id="reward-dialog-title" className="flex items-center gap-2 text-xl font-black"><Sparkles className="text-clay" />通过奖励</h2><button className="p-2" aria-label="关闭奖励弹窗" onClick={close}><X size={20} /></button></div>
      {doubledPoints > 0 && <p className="mb-4 rounded-lg bg-amber-50 p-3 font-bold text-clay">翻倍挑战成功！已额外获得 {doubledPoints} 积分。</p>}
      {rewardId && <RewardsPanel rewardId={rewardId} />}
      <button className="btn btn-secondary mt-4 w-full" onClick={close}>稍后再说</button>
      <Link className="mt-3 block text-center text-sm font-bold text-steel underline" onClick={close} href="/student/rewards">查看我的奖励</Link>
    </div>
  </div>, document.body);
}

export function RewardAfterAccepted({ problemId, suspended, update }: { problemId: number; suspended: boolean; update: RewardSubmissionUpdate | null }) {
  const { data } = useRewards(`?problemId=${problemId}`);
  const [dismissed, setDismissed] = useState("");
  const pending = data?.rewards.find((reward) => reward.amount === null);
  const [recoveredId, setRecoveredId] = useState<number>();
  useEffect(() => {
    if (!pending) return;
    const frame = requestAnimationFrame(() => setRecoveredId(pending.id));
    return () => cancelAnimationFrame(frame);
  }, [pending]);
  const rewardId = update?.rewardId ?? recoveredId;
  const doubledPoints = update?.doubledPoints ?? 0;
  const key = `${problemId}:${rewardId ?? ""}:${doubledPoints}`;
  const close = useCallback(() => setDismissed(key), [key]);
  const visible = useAutomaticOverlay(!suspended && !data?.blockedByExam && Boolean(rewardId || doubledPoints) && dismissed !== key, 70);
  if (!visible) return null;
  return <RewardDialog rewardId={rewardId ?? undefined} doubledPoints={doubledPoints} close={close} />;
}

export function RewardsHomeBanner() {
  const { data, serverOffset } = useRewards();
  if (!data || data.blockedByExam || (!data.currentChallenge && !data.pendingDrawCount)) return null;
  return <section className="surface mb-6 p-4">
    {data.currentChallenge && <RewardChallengeCard challenge={data.currentChallenge} serverOffset={serverOffset} />}
    <Link className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-clay" href="/student/rewards"><Gift aria-hidden="true" size={17} />我的奖励{data.pendingDrawCount ? ` · ${data.pendingDrawCount} 次抽奖待领取` : " · 查看记录"}<ArrowRight aria-hidden="true" size={16} /></Link>
  </section>;
}
