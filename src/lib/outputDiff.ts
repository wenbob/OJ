import { CPP_OUTPUT_PREVIEW_LENGTH, CPP_OUTPUT_TRUNCATION_SUFFIX, normalizeCppOutput } from "./cppRun";

export type OutputDiffSegment = {
  actual: string;
  changed: boolean;
  expected: string;
};

export type OutputHighlight = {
  start: number;
  end: number;
};

export type OutputDiff = {
  actualHighlights: OutputHighlight[];
  approximate: boolean;
  firstDifference: { line: number; column: number } | null;
  segments: OutputDiffSegment[];
  truncated: boolean;
};

// Bound comparison work so unrelated long outputs cannot block the editor.
const MAX_DIFF_CELLS = 1_000_000;

function prepareOutput(value: string) {
  const truncated = value.length > CPP_OUTPUT_PREVIEW_LENGTH && value.endsWith(CPP_OUTPUT_TRUNCATION_SUFFIX);
  const text = truncated
    ? value.slice(0, -CPP_OUTPUT_TRUNCATION_SUFFIX.length)
    : value;
  const characters = Array.from(normalizeCppOutput(text));
  const offsets: OutputHighlight[] = [];
  let index = 0;
  // Normalization only removes whitespace and converts line endings. Map the
  // retained characters back to their original positions for faithful display.
  for (const match of text.matchAll(/\r\n|\r|[^\r]/gu)) {
    if (index === characters.length) break;
    const character = match[0] === "\r" || match[0] === "\r\n" ? "\n" : match[0];
    if (character === characters[index]) {
      offsets.push({ start: match.index, end: match.index + match[0].length });
      index++;
    }
  }
  return { characters, offsets, truncated };
}

export function buildOutputDiff(expectedOutput: string, actualOutput: string): OutputDiff {
  const expected = prepareOutput(expectedOutput);
  const actual = prepareOutput(actualOutput);
  const left = expected.characters;
  const right = actual.characters;
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < left.length - prefix && suffix < right.length - prefix &&
    left[left.length - suffix - 1] === right[right.length - suffix - 1]
  ) {
    suffix++;
  }

  const segments: OutputDiffSegment[] = [];
  function append(changed: boolean, expectedText: string, actualText: string) {
    if (!expectedText && !actualText) return;
    const last = segments.at(-1);
    if (last?.changed === changed) {
      last.expected += expectedText;
      last.actual += actualText;
    } else {
      segments.push({ actual: actualText, changed, expected: expectedText });
    }
  }

  const commonPrefix = left.slice(0, prefix).join("");
  append(false, commonPrefix, commonPrefix);
  const leftMiddle = left.slice(prefix, left.length - suffix);
  const rightMiddle = right.slice(prefix, right.length - suffix);
  const rowSize = rightMiddle.length + 1;
  const cells = (leftMiddle.length + 1) * rowSize;
  const approximate = leftMiddle.length > 0 && rightMiddle.length > 0 && cells > MAX_DIFF_CELLS;

  if (!leftMiddle.length || !rightMiddle.length || approximate) {
    append(true, leftMiddle.join(""), rightMiddle.join(""));
  } else {
    // Longest common subsequence keeps later matching text aligned after omissions.
    const lengths = new Uint16Array(cells);
    for (let i = leftMiddle.length - 1; i >= 0; i--) {
      for (let j = rightMiddle.length - 1; j >= 0; j--) {
        const index = i * rowSize + j;
        lengths[index] = leftMiddle[i] === rightMiddle[j]
          ? lengths[index + rowSize + 1] + 1
          : Math.max(lengths[index + rowSize], lengths[index + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < leftMiddle.length || j < rightMiddle.length) {
      if (i < leftMiddle.length && j < rightMiddle.length && leftMiddle[i] === rightMiddle[j]) {
        append(false, leftMiddle[i++], rightMiddle[j++]);
      } else if (i < leftMiddle.length && (
        j === rightMiddle.length || lengths[(i + 1) * rowSize + j] >= lengths[i * rowSize + j + 1]
      )) {
        append(true, leftMiddle[i++], "");
      } else {
        append(true, "", rightMiddle[j++]);
      }
    }
  }
  const commonSuffix = suffix ? left.slice(-suffix).join("") : "";
  append(false, commonSuffix, commonSuffix);
  const prefixLines = commonPrefix.split("\n");
  const actualHighlights: OutputHighlight[] = [];
  let actualIndex = 0;
  for (const segment of segments) {
    if (segment.changed && !segment.actual) {
      const position = actual.offsets[actualIndex]?.start ?? actual.offsets.at(-1)?.end ?? 0;
      actualHighlights.push({ start: position, end: position });
    }
    const characterCount = Array.from(segment.actual).length;
    for (let index = 0; index < characterCount; index++) {
      const offset = actual.offsets[actualIndex++];
      if (!segment.changed) continue;
      const last = actualHighlights.at(-1);
      if (last && last.start !== last.end && last.end === offset.start) {
        last.end = offset.end;
      } else {
        actualHighlights.push({ ...offset });
      }
    }
  }
  return {
    actualHighlights,
    approximate,
    firstDifference: leftMiddle.length || rightMiddle.length
      ? { line: prefixLines.length, column: Array.from(prefixLines.at(-1) ?? "").length + 1 }
      : null,
    segments,
    truncated: expected.truncated || actual.truncated,
  };
}
