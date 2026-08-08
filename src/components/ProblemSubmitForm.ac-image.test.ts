import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("ProblemSubmitForm Accepted image", () => {
  it("loads the AC artwork directly instead of using the Next image optimizer", () => {
    const source = readFileSync(
      new URL("./ProblemSubmitForm.tsx", import.meta.url),
      "utf8",
    );
    const acImage = source.match(
      /<Image\b(?=[\s\S]*?src=\{AC_SUCCESS_IMAGE_SRC\})[\s\S]*?\/>/,
    );

    expect(acImage?.[0]).toContain("unoptimized");
  });

  it("preloads on mount and waits for readiness before opening the popup", () => {
    const source = readFileSync(
      new URL("./ProblemSubmitForm.tsx", import.meta.url),
      "utf8",
    );
    const acceptedBranch = source.match(
      /if \(data\.submission\?\.status === "Accepted"\) \{([\s\S]*?)\n    \}/,
    );

    expect(source).toContain("void preloadAcSuccessImage();");
    expect(acceptedBranch?.[1]).toContain(
      "await preloadAcSuccessImage()",
    );
    expect(acceptedBranch?.[1]?.indexOf("await preloadAcSuccessImage()"))
      .toBeLessThan(
        acceptedBranch?.[1]?.indexOf("setShowAcceptedPopup(true)") ?? -1,
      );
    expect(source).toContain("document.body");
  });
});
