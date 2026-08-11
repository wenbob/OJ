import { describe, expect, it } from "vitest";
import { runExamStartSerialized } from "./examStartLock";

describe("exam start serialization", () => {
  it("serializes overlapping starts for one student", async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = runExamStartSerialized(7, async () => {
      order.push("first-start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push("first-end");
    });
    const second = runExamStartSerialized(7, async () => {
      order.push("second-start");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["first-start"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });
});
