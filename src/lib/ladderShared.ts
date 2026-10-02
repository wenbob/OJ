import type { RankVisualKey } from "./rankVisual";

export const RANK_POINT_PER_UNIQUE_ACCEPTED = 10;
export const MAX_LADDER_POINTS = 2_147_483_647;
export const LADDER_PAGE_SIZE = 20;
export const POINT_ADJUSTMENT_REASON_MAX_LENGTH = 200;

export type RankTier = { key: RankVisualKey; minPoints: number; title: string };
export const DEFAULT_RANK_TIERS: readonly RankTier[] = [
  { key: "bronze", minPoints: 0, title: "青铜学徒" },
  { key: "silver", minPoints: 65, title: "白银新秀" },
  { key: "gold", minPoints: 130, title: "黄金精英" },
  { key: "platinum", minPoints: 260, title: "铂金高手" },
  { key: "diamond", minPoints: 455, title: "钻石强者" },
  { key: "star", minPoints: 715, title: "星耀大师" },
  { key: "king", minPoints: 1040, title: "最强王者" },
  { key: "glory", minPoints: 1560, title: "荣耀王者" },
];
export type LadderSettings = { revision: string; tiers: RankTier[] };
export type PointAdjustmentMode = "add" | "deduct" | "set";
export type PointAdjustmentInput = {
  mode: PointAdjustmentMode;
  inputPoints: number;
  expectedPoints: number;
  reason: string;
  requestId: string;
};
export type PointAdjustmentView = {
  id: number;
  studentId: number | null;
  studentIdSnapshot: number;
  studentUsername: string;
  administratorUsername: string;
  mode: PointAdjustmentMode;
  inputPoints: number;
  amount: number;
  beforePoints: number;
  afterPoints: number;
  reason: string;
  createdAt: string;
};

export const POINT_ADJUSTMENT_MODE_LABELS: Record<PointAdjustmentMode, string> = {
  add: "加分", deduct: "扣分", set: "设定总分",
};

export function isLadderPointValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_LADDER_POINTS;
}

export function validateTierThresholds(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== DEFAULT_RANK_TIERS.length || !value.every(isLadderPointValue)) {
    return "请为八个段位填写有效的整数积分门槛";
  }
  if (value[0] !== 0) return "青铜段位的最低积分必须为 0";
  for (let index = 1; index < value.length; index++) {
    if (value[index] <= value[index - 1]) return "段位门槛必须按顺序严格递增";
  }
  return null;
}

export function tiersFromThresholds(minPoints: number[]): RankTier[] {
  return DEFAULT_RANK_TIERS.map((tier, index) => ({ ...tier, minPoints: minPoints[index] }));
}

export function getRankTierTitle(points: number, tiers: readonly RankTier[] = DEFAULT_RANK_TIERS) {
  let current = tiers[0].title;
  for (const tier of tiers) {
    if (points < tier.minPoints) break;
    current = tier.title;
  }
  return current;
}

export function getRankTierProgress(points: number, tiers: readonly RankTier[] = DEFAULT_RANK_TIERS) {
  const safePoints = Math.max(0, points);
  let index = 0;
  for (const [tierIndex, tier] of tiers.entries()) {
    if (safePoints < tier.minPoints) break;
    index = tierIndex;
  }
  const current = tiers[index];
  const next = tiers[index + 1];
  const span = next ? next.minPoints - current.minPoints : 0;
  const into = next ? Math.min(span, Math.max(0, safePoints - current.minPoints)) : Math.max(0, safePoints - current.minPoints);
  const gap = next ? Math.max(0, next.minPoints - safePoints) : 0;
  return {
    acceptedProblemsToNextTier: Math.ceil(gap / RANK_POINT_PER_UNIQUE_ACCEPTED),
    currentTierMinPoints: current.minPoints, currentTierTitle: current.title,
    isMaxTier: !next, nextTierMinPoints: next?.minPoints ?? null,
    nextTierTitle: next?.title ?? null, pointsForCurrentTier: span,
    pointsIntoTier: into, pointsToNextTier: gap,
    progressPercent: next ? Math.round((into / span) * 100) : 100,
  };
}

export function previewAdjustedPoints(currentPoints: number, mode: PointAdjustmentMode, inputPoints: number) {
  return mode === "set" ? inputPoints : currentPoints + (mode === "deduct" ? -inputPoints : inputPoints);
}

export function parsePointAdjustmentInput(value: unknown): PointAdjustmentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求格式不合法");
  const record = value as Record<string, unknown>;
  const keys = ["mode", "inputPoints", "expectedPoints", "reason", "requestId"];
  if (Object.keys(record).some((key) => !keys.includes(key))) throw new Error("请求包含不支持的字段");
  const mode = record.mode;
  if (mode !== "add" && mode !== "deduct" && mode !== "set") throw new Error("请选择有效的调分操作");
  if (!isLadderPointValue(record.inputPoints) || (mode !== "set" && record.inputPoints === 0)) throw new Error("加分和扣分必须为正整数，设定总分必须为非负整数");
  if (!isLadderPointValue(record.expectedPoints)) throw new Error("当前积分不合法，请刷新后重试");
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (!reason || Array.from(reason).length > POINT_ADJUSTMENT_REASON_MAX_LENGTH) throw new Error("请填写 1～200 字的调分理由");
  if (typeof record.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.requestId)) throw new Error("请求标识不合法，请重新提交");
  return { mode, inputPoints: record.inputPoints, expectedPoints: record.expectedPoints, reason, requestId: record.requestId };
}
