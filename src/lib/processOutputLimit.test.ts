import { describe, expect, it } from "vitest";
import { createLimitedOutputCollector } from "./processOutputLimit";

describe("createLimitedOutputCollector", () => {
  it("keeps collected output within the byte limit", () => {
    const collector = createLimitedOutputCollector(5);

    collector.append("abc");
    collector.append("def");

    expect(collector.value()).toBe("abcde");
    expect(collector.exceeded()).toBe(true);
  });
});
