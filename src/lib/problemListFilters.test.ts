import { describe, expect, it } from "vitest";
import { buildProblemListWhere, problemLibraryHref, readProblemListFilters, safeProblemLibraryReturnTo } from "./problemListFilters";

describe("problem library filter boundaries", () => {
  it("combines numeric IDs with title matching and scopes Accepted to the current user across all history", () => {
    const filters = readProblemListFilters(new URLSearchParams("q=00101&problemType=objective&category=E2E&difficulty=入门&completion=accepted"));
    expect(buildProblemListWhere(filters, 9)).toEqual({
      archivedAt: null, problemType: "objective", category: "E2E", difficulty: "入门",
      OR: [{ id: 101 }, { title: { contains: "00101" } }],
      submissions: { some: { userId: 9, status: "Accepted" } },
    });
    expect(buildProblemListWhere({ ...filters, completion: "unaccepted" }, 9).submissions).toEqual({ none: { userId: 9, status: "Accepted" } });
  });
  it("treats never-attempted problems as unpassed and avoids oversized integer queries", () => {
    for (const q of ["题名", "0", "9999999999999999999999999", "1.2", "-1"]) {
      const filters = readProblemListFilters(new URLSearchParams({ q, completion: "unaccepted" }));
      expect(buildProblemListWhere(filters, 1).OR).toEqual([{ title: { contains: q } }]);
      expect(buildProblemListWhere(filters, 1).submissions).toEqual({ none: { userId: 1, status: "Accepted" } });
    }
  });
  it("normalizes unknown filters without changing the API's default all-types behavior", () => {
    const filters = readProblemListFilters(new URLSearchParams({ q: `  ${"x".repeat(150)}  `, completion: "other", problemType: "bad" }));
    expect(filters.q).toHaveLength(100);
    expect(filters.problemType).toBeUndefined();
    expect(buildProblemListWhere(filters, 1).submissions).toBeUndefined();
  });
  it("preserves filters in paging and limits return links to the known library route", () => {
    const filters = readProblemListFilters(new URLSearchParams("problemType=programming&q=加法&difficulty=进阶&completion=accepted"));
    const href = problemLibraryHref(filters, { page: 3, pageSize: 1 });
    expect(safeProblemLibraryReturnTo(href)).toBe(href);
    expect(problemLibraryHref({ ...filters, category: "循环" }, { pageSize: 1 })).not.toContain("page=");
    for (const value of ["https://evil.test", "//evil.test", "/student/problems/123", "/student/problems/../exams", "/admin"]) expect(safeProblemLibraryReturnTo(value)).toBe("/student/problems");
    expect(safeProblemLibraryReturnTo("/student/problems?returnTo=https://evil.test&page=-1&pageSize=999")).toBe("/student/problems");
  });
});
