import { describe, expect, it } from "vitest";
import {
  buildStudentRankings,
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
