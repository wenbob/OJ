import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "./auth";
import { acceptRewardChallenge, drawReward, getRewards, RewardError } from "./rewards";

export async function rewardApi(request: NextRequest, action?: "draw" | "challenge", id?: string) {
  const auth = await requireApiUser(request, "student");
  if (auth.response) {
    auth.response.headers.set("Cache-Control", "private, no-store");
    return auth.response;
  }
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  try {
    if (action) {
      const rewardId = Number(id);
      if (!Number.isSafeInteger(rewardId) || rewardId <= 0) return json({ error: "奖励不存在" }, 404);
      if (action === "draw") await drawReward(auth.user.id, rewardId);
      else await acceptRewardChallenge(auth.user.id, rewardId);
      return json(await getRewards(auth.user.id, { rewardId }));
    }
    const params = request.nextUrl.searchParams;
    const page = Number(params.get("page") ?? "1");
    const rewardId = params.has("rewardId") ? Number(params.get("rewardId")) : undefined;
    const problemId = params.has("problemId") ? Number(params.get("problemId")) : undefined;
    if (![page, rewardId, problemId].every((n) => n === undefined || (Number.isSafeInteger(n) && n > 0))) {
      return json({ error: "查询参数不合法" }, 400);
    }
    return json(await getRewards(auth.user.id, { page, rewardId, problemId }));
  } catch (error) {
    if (error instanceof RewardError) return json({ error: error.message }, error.status);
    console.error("[REWARD_REQUEST_FAILED]", { userId: auth.user.id });
    return json({ error: "奖励操作暂时失败，请重试；已发放的积分不会重复发放" }, 503);
  }
}
