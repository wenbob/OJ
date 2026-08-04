import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("ProblemSubmitForm Accepted image", () => {
  it("loads the AC artwork directly instead of using the Next image optimizer", () => {
    const source = readFileSync(
      new URL("./ProblemSubmitForm.tsx", import.meta.url),
      "utf8",
    );
    const acImage = source.match(
      /<Image\b(?=[\s\S]*?src="\/ac-success\.png")[\s\S]*?\/>/,
    );

    expect(acImage?.[0]).toContain("unoptimized");
  });
});
