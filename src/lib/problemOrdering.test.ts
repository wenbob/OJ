import { describe, expect, it } from "vitest";
import {
  getProblemOrderBy,
  getTitleSortedProblemPageIds,
  isPersistableProblemListSort,
  moveItemRelative,
  moveProblemRelative,
  normalizeProblemListSort,
  orderProblemCategories,
  orderProblemsByIds,
  sortProblemsForSavedView,
  sortProblemsByTitle,
} from "./problemOrdering";

describe("problem ordering", () => {
  it("normalizes supported list sorts and falls back to custom", () => {
    expect(normalizeProblemListSort("title-desc")).toBe("title-desc");
    expect(normalizeProblemListSort("unknown")).toBe("custom");
    expect(normalizeProblemListSort(undefined)).toBe("custom");
  });

  it("uses stable database ordering for custom and creation-time views", () => {
    expect(getProblemOrderBy("custom")).toEqual([
      { sortOrder: "desc" },
      { id: "desc" },
    ]);
    expect(getProblemOrderBy("newest")).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    expect(getProblemOrderBy("oldest")).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
    expect(getProblemOrderBy("title-asc")).toEqual([
      { title: "asc" },
      { id: "asc" },
    ]);
  });

  it("sorts mixed numeric titles naturally and paginates after sorting", () => {
    const rows = [
      { id: 10, title: "第 10 题" },
      { id: 2, title: "第 2 题" },
      { id: 1, title: "第 1 题" },
    ];

    expect(sortProblemsByTitle(rows, "title-asc").map((row) => row.id)).toEqual([
      1, 2, 10,
    ]);
    expect(sortProblemsByTitle(rows, "title-desc").map((row) => row.id)).toEqual([
      10, 2, 1,
    ]);
    expect(getTitleSortedProblemPageIds(rows, "title-asc", 1, 1)).toEqual([2]);
  });

  it("puts configured categories first and appends new categories naturally", () => {
    expect(
      orderProblemCategories(
        ["GESP 十级", "数组", "GESP 二级", "循环"],
        [
          { category: "循环", sortOrder: 0 },
          { category: "数组", sortOrder: 1 },
          { category: "已删除", sortOrder: 2 },
        ],
      ),
    ).toEqual(["循环", "数组", "GESP 二级", "GESP 十级"]);
  });

  it("restores database rows to an explicit title-sorted id sequence", () => {
    expect(
      orderProblemsByIds(
        [
          { id: 3, title: "C" },
          { id: 1, title: "A" },
          { id: 2, title: "B" },
        ],
        [1, 2, 3],
      ).map((row) => row.id),
    ).toEqual([1, 2, 3]);
  });

  it("moves a problem before or after another problem without swapping only", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

    expect(moveProblemRelative(rows, 4, 2, "before").map((row) => row.id)).toEqual([
      1, 4, 2, 3,
    ]);
    expect(moveProblemRelative(rows, 1, 3, "after").map((row) => row.id)).toEqual([
      2, 3, 1, 4,
    ]);
    expect(moveProblemRelative(rows, 2, 2, "after")).toEqual(rows);
    expect(moveItemRelative(["A", "B", "C"], 0, 2, "after")).toEqual([
      "B",
      "C",
      "A",
    ]);
  });

  it("sorts complete saved views by title or creation time", () => {
    const rows = [
      { id: 10, title: "第 10 题", createdAt: new Date("2026-01-02") },
      { id: 2, title: "第 2 题", createdAt: new Date("2026-01-03") },
      { id: 1, title: "第 1 题", createdAt: new Date("2026-01-01") },
    ];

    expect(sortProblemsForSavedView(rows, "title-asc").map((row) => row.id)).toEqual([
      1, 2, 10,
    ]);
    expect(sortProblemsForSavedView(rows, "newest").map((row) => row.id)).toEqual([
      2, 10, 1,
    ]);
    expect(sortProblemsForSavedView(rows, "oldest").map((row) => row.id)).toEqual([
      1, 10, 2,
    ]);
    expect(isPersistableProblemListSort("title-desc")).toBe(true);
    expect(isPersistableProblemListSort("custom")).toBe(false);
  });
});
