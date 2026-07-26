import { describe, expect, it } from "vitest";
import {
  calculateViewportCenteredStickyTop,
  VIEWPORT_STICKY_GUTTER_PX,
} from "./ViewportCenteredStickyPanel";

describe("calculateViewportCenteredStickyTop", () => {
  it("centers a panel shorter than the viewport", () => {
    expect(
      calculateViewportCenteredStickyTop({
        contentHeight: 500,
        viewportHeight: 900,
      }),
    ).toBe(200);
  });

  it("keeps the minimum gutter when the panel is taller than the viewport", () => {
    expect(
      calculateViewportCenteredStickyTop({
        contentHeight: 1200,
        viewportHeight: 900,
      }),
    ).toBe(VIEWPORT_STICKY_GUTTER_PX);
  });

  it("falls back to the gutter for invalid viewport measurements", () => {
    expect(
      calculateViewportCenteredStickyTop({
        contentHeight: Number.NaN,
        viewportHeight: 900,
      }),
    ).toBe(VIEWPORT_STICKY_GUTTER_PX);
    expect(
      calculateViewportCenteredStickyTop({
        contentHeight: 500,
        viewportHeight: 0,
      }),
    ).toBe(VIEWPORT_STICKY_GUTTER_PX);
  });
});
