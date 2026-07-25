import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PROBLEM_LIST_PAGE_SIZE,
  readPaginationFromObject,
  readPaginationFromUrl,
} from "./pagination";

describe("pagination defaults", () => {
  it("keeps the shared record-list default at 20", () => {
    expect(readPaginationFromObject({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
  });

  it("supports the problem-list default of 50", () => {
    expect(readPaginationFromObject({}, PROBLEM_LIST_PAGE_SIZE)).toEqual({
      page: 1,
      pageSize: PROBLEM_LIST_PAGE_SIZE,
      skip: 0,
    });
    expect(
      readPaginationFromUrl(new URLSearchParams(), PROBLEM_LIST_PAGE_SIZE),
    ).toEqual({
      page: 1,
      pageSize: PROBLEM_LIST_PAGE_SIZE,
      skip: 0,
    });
  });

  it("preserves explicit values and the existing maximum", () => {
    expect(
      readPaginationFromObject(
        { page: "2", pageSize: "20" },
        PROBLEM_LIST_PAGE_SIZE,
      ),
    ).toEqual({ page: 2, pageSize: 20, skip: 20 });
    expect(
      readPaginationFromObject(
        { pageSize: "200" },
        PROBLEM_LIST_PAGE_SIZE,
      ),
    ).toEqual({ page: 1, pageSize: MAX_PAGE_SIZE, skip: 0 });
  });
});
