import { describe, expect, it } from "vitest";
import {
  buildStudentRankings,
  buildStudentRankingSummary,
  getRankTierProgress,
  getRankTierTitle,
  normalizeCustomTitle,
  validateCustomTitle,
} from "./ranking";

const users = [
  { id: 1, username: "alex", role: "student", studentProfile: null },
  {
    id: 2,
    username: "bob",
    role: "student",
    studentProfile: { customTitle: "  C++ 小霸王  " },
  },
  { id: 3, username: "teacher", role: "admin", studentProfile: null },
];

describe("student rankings", () => {
  it("uses the raised rank thresholds", () => {
    expect(getRankTierTitle(0)).toBe("青铜学徒");
    expect(getRankTierTitle(64)).toBe("青铜学徒");
    expect(getRankTierTitle(65)).toBe("白银新秀");
    expect(getRankTierTitle(130)).toBe("黄金精英");
    expect(getRankTierTitle(260)).toBe("铂金高手");
    expect(getRankTierTitle(455)).toBe("钻石强者");
    expect(getRankTierTitle(715)).toBe("星耀大师");
    expect(getRankTierTitle(1040)).toBe("最强王者");
    expect(getRankTierTitle(1560)).toBe("荣耀王者");
  });

  it("calculates progress toward the next rank tier", () => {
    expect(getRankTierProgress(60)).toMatchObject({
      acceptedProblemsToNextTier: 1,
      currentTierTitle: "青铜学徒",
      nextTierMinPoints: 65,
      nextTierTitle: "白银新秀",
      pointsForCurrentTier: 65,
      pointsIntoTier: 60,
      pointsToNextTier: 5,
      progressPercent: 92,
    });

    expect(getRankTierProgress(65)).toMatchObject({
      acceptedProblemsToNextTier: 7,
      currentTierTitle: "白银新秀",
      nextTierTitle: "黄金精英",
      pointsIntoTier: 0,
      pointsToNextTier: 65,
      progressPercent: 0,
    });
  });

  it("marks the highest rank tier as complete", () => {
    expect(getRankTierProgress(1600)).toMatchObject({
      acceptedProblemsToNextTier: 0,
      currentTierTitle: "荣耀王者",
      isMaxTier: true,
      nextTierTitle: null,
      pointsToNextTier: 0,
      progressPercent: 100,
    });
  });

  it("counts unique accepted problems for points and keeps accepted submission count as tie-breaker", () => {
    const rankings = buildStudentRankings({
      users,
      submissions: [
        { userId: 1, problemId: 1, status: "Accepted" },
        { userId: 1, problemId: 1, status: "Accepted" },
        { userId: 1, problemId: 2, status: "Wrong Answer" },
        { userId: 2, problemId: 1, status: "Accepted" },
      ],
    });

    expect(rankings).toMatchObject([
      {
        acceptedSubmissionCount: 2,
        acCount: 1,
        points: 10,
        rank: 1,
        userId: 1,
      },
      {
        acceptedSubmissionCount: 1,
        acCount: 1,
        points: 10,
        rank: 2,
        userId: 2,
      },
    ]);
  });

  it("uses custom title only for display", () => {
    const rankings = buildStudentRankings({
      users,
      submissions: [{ userId: 2, problemId: 1, status: "Accepted" }],
    });

    expect(rankings[0]).toMatchObject({
      customTitle: "C++ 小霸王",
      displayTitle: "C++ 小霸王",
      points: 10,
      tierTitle: "青铜学徒",
    });
  });

  it("builds a current-student summary without computing the full leaderboard", () => {
    const summary = buildStudentRankingSummary({
      submissions: [
        { userId: 2, problemId: 1, status: "Accepted" },
        { userId: 2, problemId: 1, status: "Accepted" },
        { userId: 2, problemId: 2, status: "Accepted" },
      ],
      user: users[1],
    });

    expect(summary).toMatchObject({
      acceptedSubmissionCount: 3,
      acCount: 2,
      displayTitle: "C++ 小霸王",
      points: 20,
      tierTitle: "青铜学徒",
      userId: 2,
    });
  });

  it("sorts tied empty students by username then id", () => {
    const rankings = buildStudentRankings({
      users: [
        { id: 4, username: "carol", role: "student", studentProfile: null },
        { id: 2, username: "bob", role: "student", studentProfile: null },
      ],
      submissions: [],
    });

    expect(rankings.map((entry) => entry.username)).toEqual(["bob", "carol"]);
  });

  it("normalizes and validates custom titles", () => {
    expect(normalizeCustomTitle("  荣耀队长  ")).toBe("荣耀队长");
    expect(normalizeCustomTitle("   ")).toBeNull();
    expect(validateCustomTitle("荣耀队长")).toBeNull();
    expect(validateCustomTitle("一二三四五六七八九十一二三四五六七八九十一")).toBe(
      "自定义头衔不能超过 20 个字符",
    );
  });
});
