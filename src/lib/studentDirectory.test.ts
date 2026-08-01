import { describe, expect, it } from "vitest";
import {
  getStudentDirectoryMetadata,
  sortStudentsByDirectory,
} from "./studentDirectory";
import { filterStudentsByUsername } from "./studentDirectorySearch";

describe("student directory ordering", () => {
  it("groups Chinese names by surname pinyin and puts other prefixes last", () => {
    const result = sortStudentsByDirectory([
      { id: 8, username: "_小明" },
      { id: 7, username: "2号" },
      { id: 4, username: "张三" },
      { id: 3, username: "曾国藩" },
      { id: 2, username: "白雪" },
      { id: 1, username: "安安" },
      { id: 6, username: "alice2" },
      { id: 5, username: "Alice10" },
    ]);

    expect(result.map((student) => student.username)).toEqual([
      "alice2",
      "Alice10",
      "安安",
      "白雪",
      "曾国藩",
      "张三",
      "_小明",
      "2号",
    ]);
    expect(result.map((student) => student.directoryInitial)).toEqual([
      "A",
      "A",
      "A",
      "B",
      "Z",
      "Z",
      "#",
      "#",
    ]);
  });

  it("uses the original username and id as deterministic tie breakers", () => {
    const result = sortStudentsByDirectory([
      { id: 9, username: "Alice" },
      { id: 3, username: "Alice" },
      { id: 4, username: "alice" },
    ]);

    expect(result.map((student) => student.id)).toEqual([4, 3, 9]);
  });

  it("recognizes Chinese, latin and fallback initials", () => {
    expect(getStudentDirectoryMetadata("欧阳娜娜").initial).toBe("O");
    expect(getStudentDirectoryMetadata("Bob").initial).toBe("B");
    expect(getStudentDirectoryMetadata(" 9号").initial).toBe("#");
  });
});

describe("student directory search", () => {
  const students = [
    { username: "Alice01" },
    { username: "张小明" },
    { username: "Bob" },
  ];

  it("matches usernames by trimmed case-insensitive substring", () => {
    expect(filterStudentsByUsername(students, "  ALICE ")).toEqual([
      { username: "Alice01" },
    ]);
    expect(filterStudentsByUsername(students, "小明")).toEqual([
      { username: "张小明" },
    ]);
  });

  it("returns all students for an empty keyword", () => {
    expect(filterStudentsByUsername(students, "  ")).toBe(students);
  });
});
