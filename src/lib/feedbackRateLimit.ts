import { FeedbackError } from "@/lib/feedbackErrors";
import { FEEDBACK_LIMITS } from "@/lib/feedbackShared";

const active = new Set<number>();
const cooldowns = new Map<number, number>();
const MAX_ACTIVE_UPLOADS = 2;

export function reserveFeedbackSubmission(userId: number) {
  const now = Date.now();
  for (const [id, until] of cooldowns) if (until <= now) cooldowns.delete(id);
  if (active.has(userId)) throw new FeedbackError("反馈正在提交，请勿重复操作", 429, 1);
  const until = cooldowns.get(userId);
  if (until) throw new FeedbackError("刚刚已提交反馈，请稍后再试", 429, Math.ceil((until - now) / 1000));
  if (active.size >= MAX_ACTIVE_UPLOADS) throw new FeedbackError("反馈服务繁忙，请稍后重试", 503, 3);
  active.add(userId);
  let released = false;
  return {
    release(success: boolean) {
      if (released) return;
      released = true;
      active.delete(userId);
      if (success) cooldowns.set(userId, Date.now() + FEEDBACK_LIMITS.cooldownMs);
    },
  };
}
