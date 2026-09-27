// Prisma Int / SQLite arithmetic remains exact within this per-award range.
export const MAX_REWARD_POINTS = 2_147_483_647;
export const REWARD_PAGE_SIZE = 20;
export const CHALLENGE_DURATION_MS = 24 * 60 * 60 * 1000;
export const REWARD_OFFER_DURATION_MS = 24 * 60 * 60 * 1000;

export type RewardOfferStatus = "pending_draw" | "available" | "expired" | "accepted";
export function getRewardOfferStatus(amount: number | null, offerExpiresAt: Date | null, challengeStatus: string | undefined, now: Date): RewardOfferStatus {
  if (amount === null) return "pending_draw";
  if (challengeStatus && challengeStatus !== "cancelled") return "accepted";
  return offerExpiresAt && now.getTime() < offerExpiresAt.getTime() ? "available" : "expired";
}

export function validateRewardRange(min: string, max: string) {
  if (![min, max].every((value) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= MAX_REWARD_POINTS)) {
    return `奖励积分必须是 1～${MAX_REWARD_POINTS} 的整数`;
  }
  return Number(min) > Number(max) ? "最低奖励不能大于最高奖励" : null;
}

export type RewardChallengeView = {
  id: number;
  rewardId: number;
  targetProblemId: number;
  targetTitle: string;
  status: string;
  acceptedAt: string;
  expiresAt: string;
  amount: number;
};

export type RewardView = {
  id: number;
  problemTitle: string;
  minPoints: number;
  maxPoints: number;
  amount: number | null;
  createdAt: string;
  offerExpiresAt: string | null;
  offerStatus: RewardOfferStatus;
  challenge: RewardChallengeView | null;
};

export type RewardSubmissionUpdate = {
  rewardId: number | null;
  doubledPoints: number;
};

export type RewardsResponse = {
  serverNow: string;
  rewards: RewardView[];
  currentChallenge: RewardChallengeView | null;
  rewardPoints: number;
  pendingDrawCount: number;
  page: number;
  totalPages: number;
  blockedByExam: boolean;
};
