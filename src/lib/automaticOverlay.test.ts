import { afterEach, expect, it, vi } from "vitest";
import { createOverlayQueue } from "./automaticOverlay";
afterEach(() => vi.useRealTimers());
it("prioritizes task and reward requests, never preempts, and releases on unmount", () => {
  vi.useFakeTimers();
  const queue = createOverlayQueue();
  const notify = vi.fn(); const unsubscribe = queue.subscribe(notify);
  const releaseAnnouncement = queue.request("announcement", 10);
  const releaseTask = queue.request("task", 80);
  vi.runAllTimers(); expect(queue.snapshot()).toBe("task");
  const releaseReward = queue.request("reward", 70);
  vi.runAllTimers(); expect(queue.snapshot()).toBe("task");
  releaseTask(); vi.runAllTimers(); expect(queue.snapshot()).toBe("reward");
  releaseReward(); vi.runAllTimers(); expect(queue.snapshot()).toBe("announcement");
  const secondTask = queue.request("task", 80);
  vi.runAllTimers(); expect(queue.snapshot()).toBe("announcement");
  releaseAnnouncement(); vi.runAllTimers(); expect(queue.snapshot()).toBe("task");
  secondTask(); vi.runAllTimers(); expect(queue.snapshot()).toBeNull();
  expect(notify).toHaveBeenCalled(); unsubscribe();
});
it("does not admit an announcement during submit to reward handoff", () => {
  vi.useFakeTimers(); const queue = createOverlayQueue();
  const submit = queue.request("submit", 100); const notice = queue.request("notice", 10);
  vi.runAllTimers(); expect(queue.snapshot()).toBe("submit");
  submit(); const reward = queue.request("reward", 70);
  vi.runAllTimers(); expect(queue.snapshot()).toBe("reward");
  reward(); notice(); vi.runAllTimers(); expect(queue.snapshot()).toBeNull();
});
