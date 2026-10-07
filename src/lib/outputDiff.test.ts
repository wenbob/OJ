import { describe, expect, it } from "vitest";
import { truncateCppOutput } from "./cppRun";
import { buildOutputDiff } from "./outputDiff";

describe("buildOutputDiff", () => {
  it("isolates changed characters and preserves matching text on both sides", () => {
    const result = buildOutputDiff("sum = 13\nok", "sum = 12\nok");
    expect(result.firstDifference).toEqual({ line: 1, column: 8 });
    expect(result.segments.filter((segment) => segment.changed)).toEqual([
      { actual: "2", changed: true, expected: "3" },
    ]);
    expect(result.segments.map((segment) => segment.expected).join("")).toBe("sum = 13\nok");
    expect(result.segments.map((segment) => segment.actual).join("")).toBe("sum = 12\nok");
  });

  it("follows Judge whitespace normalization without hiding significant spaces", () => {
    expect(buildOutputDiff("1 2\r\n3\t \r\n", "1 2\n3\n\n").firstDifference).toBeNull();
    const result = buildOutputDiff("1 2\n3", "12\n3");
    expect(result.firstDifference).toEqual({ line: 1, column: 2 });
    expect(result.segments.filter((segment) => segment.changed)).toEqual([
      { actual: "", changed: true, expected: " " },
    ]);
    expect(buildOutputDiff("1\n2", "12").segments.some((segment) => segment.changed && segment.expected === "\n")).toBe(true);
    expect(buildOutputDiff("1\t2", "1 2").firstDifference).toEqual({ line: 1, column: 2 });
  });

  it("distinguishes missing output from unwanted extra output", () => {
    expect(buildOutputDiff("3", "").segments).toEqual([{ actual: "", changed: true, expected: "3" }]);
    expect(buildOutputDiff("", "3").segments).toEqual([{ actual: "3", changed: true, expected: "" }]);
    expect(buildOutputDiff("", "").firstDifference).toBeNull();
  });

  it("keeps matching text aligned after multiple insertions and omissions", () => {
    const result = buildOutputDiff("A1 B2 C3", "A9 B2! C8");
    expect(result.segments.filter((segment) => !segment.changed).map((segment) => segment.expected)).toContain(" B2");
    expect(result.segments.map((segment) => segment.expected).join("")).toBe("A1 B2 C3");
    expect(result.segments.map((segment) => segment.actual).join("")).toBe("A9 B2! C8");
  });

  it("reports line and Unicode character positions without splitting surrogate pairs", () => {
    const result = buildOutputDiff("第一行\n😀答案甲", "第一行\n😀答案乙");
    expect(result.firstDifference).toEqual({ line: 2, column: 4 });
    expect(result.segments.filter((segment) => segment.changed)).toEqual([
      { actual: "乙", changed: true, expected: "甲" },
    ]);
  });

  it("bounds expensive comparisons and retains common prefix and suffix", () => {
    const result = buildOutputDiff(`begin\n${"a".repeat(4500)}\nend`, `begin\n${"b".repeat(4500)}\nend`);
    expect(result.approximate).toBe(true);
    expect(result.firstDifference).toEqual({ line: 2, column: 1 });
    expect(result.segments[0].expected).toBe("begin\n");
    expect(result.segments.at(-1)?.expected).toBe("\nend");
    const oneChange = buildOutputDiff(`${"a".repeat(4500)}1`, `${"a".repeat(4500)}2`);
    expect(oneChange.approximate).toBe(false);
    expect(oneChange.segments.filter((segment) => segment.changed)).toHaveLength(1);
  });

  it("does not treat server truncation labels as program output differences", () => {
    const preview = truncateCppOutput("a".repeat(6000));
    const result = buildOutputDiff(preview, preview);
    expect(result.truncated).toBe(true);
    expect(result.firstDifference).toBeNull();
    expect(result.segments).toEqual([{ actual: "a".repeat(5000), changed: false, expected: "a".repeat(5000) }]);
  });

  it("keeps a literal truncation message in short program output", () => {
    const result = buildOutputDiff("done\n...（内容过长，已截断）", "done");
    expect(result.truncated).toBe(false);
    expect(result.firstDifference).toEqual({ line: 1, column: 5 });
  });

  it("locates wrong text in the original output after ignored whitespace and CRLF", () => {
    const actual = "1 \t\r\n😀答案乙\t \r\n";
    const result = buildOutputDiff("1\n😀答案甲\n", actual);
    expect(result.actualHighlights).toEqual([
      { start: actual.indexOf("乙"), end: actual.indexOf("乙") + 1 },
    ]);
    expect(buildOutputDiff("1\n😀答案乙", actual).actualHighlights).toEqual([]);
  });

  it("marks significant spaces and anchors omissions without flagging allowed trailing whitespace", () => {
    const extraSpace = "1 2\t \r\n3 \r\n";
    expect(buildOutputDiff("12\n3", extraSpace).actualHighlights).toEqual([{ start: 1, end: 2 }]);
    expect(buildOutputDiff("1 2\n3", "12 \r\n3\n").actualHighlights).toEqual([{ start: 1, end: 1 }]);
    expect(buildOutputDiff("34", "3 \r\n").actualHighlights).toEqual([{ start: 1, end: 1 }]);
  });

  it("preserves surrogate pairs and highlights an actual extra line break", () => {
    const actual = "😀😎\n";
    const result = buildOutputDiff("😀🙂\n", actual);
    expect(result.actualHighlights).toEqual([{ start: 2, end: 4 }]);
    expect(actual.slice(2, 4)).toBe("😎");
    expect(buildOutputDiff("12", "1\r\n2").actualHighlights).toEqual([{ start: 1, end: 3 }]);
  });
});
