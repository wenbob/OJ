export type RankVisualKey =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "star"
  | "king"
  | "glory";

const visualByTierTitle: Record<string, RankVisualKey> = {
  青铜学徒: "bronze",
  白银新秀: "silver",
  黄金精英: "gold",
  铂金高手: "platinum",
  钻石强者: "diamond",
  星耀大师: "star",
  最强王者: "king",
  荣耀王者: "glory",
};

export function getRankVisualKey(tierTitle: string): RankVisualKey {
  return visualByTierTitle[tierTitle] ?? "bronze";
}
