import { describe, expect, it } from "vitest";
import { enqueueJudgeTask } from "./judgeQueue";

describe("enqueueJudgeTask", () => {
  it("limits concurrent judge tasks", async () => {
    const previousConcurrency = process.env.JUDGE_CONCURRENCY;
    process.env.JUDGE_CONCURRENCY = "1";

    let running = 0;
    let maxRunning = 0;

    try {
      await Promise.all(
        Array.from({ length: 3 }, (_, index) =>
          enqueueJudgeTask(
            () =>
              new Promise<number>((resolve) => {
                running += 1;
                maxRunning = Math.max(maxRunning, running);
                setTimeout(() => {
                  running -= 1;
                  resolve(index);
                }, 10);
              }),
          ),
        ),
      );

      expect(maxRunning).toBe(1);
    } finally {
      if (previousConcurrency === undefined) {
        delete process.env.JUDGE_CONCURRENCY;
      } else {
        process.env.JUDGE_CONCURRENCY = previousConcurrency;
      }
    }
  });

  it("keeps draining after a task fails", async () => {
    const previousConcurrency = process.env.JUDGE_CONCURRENCY;
    process.env.JUDGE_CONCURRENCY = "1";
    const finished: string[] = [];

    try {
      const failed = enqueueJudgeTask(async () => {
        finished.push("failed-start");
        throw new Error("boom");
      }).catch((error) => {
        finished.push(error instanceof Error ? error.message : "failed");
      });

      const next = enqueueJudgeTask(async () => {
        finished.push("next");
      });

      await Promise.all([failed, next]);
      expect(finished).toEqual(["failed-start", "boom", "next"]);
    } finally {
      if (previousConcurrency === undefined) {
        delete process.env.JUDGE_CONCURRENCY;
      } else {
        process.env.JUDGE_CONCURRENCY = previousConcurrency;
      }
    }
  });

  it("runs a formal submission before trial runs that have not started", async () => {
    const previousConcurrency = process.env.JUDGE_CONCURRENCY;
    process.env.JUDGE_CONCURRENCY = "1";
    const order: string[] = [];
    let releaseRunning: (() => void) | undefined;

    try {
      const running = enqueueJudgeTask(
        () =>
          new Promise<void>((resolve) => {
            order.push("running-trial");
            releaseRunning = resolve;
          }),
        { priority: "trial" },
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      const firstTrial = enqueueJudgeTask(
        async () => {
          order.push("trial-1");
        },
        { priority: "trial" },
      );
      const secondTrial = enqueueJudgeTask(
        async () => {
          order.push("trial-2");
        },
        { priority: "trial" },
      );
      const submission = enqueueJudgeTask(async () => {
        order.push("submission");
      });

      releaseRunning?.();
      await Promise.all([running, firstTrial, secondTrial, submission]);
      expect(order).toEqual([
        "running-trial",
        "submission",
        "trial-1",
        "trial-2",
      ]);
    } finally {
      if (previousConcurrency === undefined) {
        delete process.env.JUDGE_CONCURRENCY;
      } else {
        process.env.JUDGE_CONCURRENCY = previousConcurrency;
      }
    }
  });

  it("rejects new judge tasks when the pending queue is full", async () => {
    const previousConcurrency = process.env.JUDGE_CONCURRENCY;
    const previousMaxQueueSize = process.env.JUDGE_MAX_QUEUE_SIZE;
    process.env.JUDGE_CONCURRENCY = "1";
    process.env.JUDGE_MAX_QUEUE_SIZE = "1";

    let releaseFirstTask: (() => void) | undefined;
    const first = enqueueJudgeTask(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstTask = resolve;
        }),
    );
    const second = enqueueJudgeTask(async () => {});

    try {
      const result = await Promise.race([
        enqueueJudgeTask(async () => {}).then(
          () => "resolved",
          (error) => (error instanceof Error ? error.message : "rejected"),
        ),
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("still-pending"), 25);
        }),
      ]);
      expect(result).toBe("评测队列繁忙，请稍后再提交");
    } finally {
      releaseFirstTask?.();
      await Promise.all([first, second]);
      if (previousConcurrency === undefined) {
        delete process.env.JUDGE_CONCURRENCY;
      } else {
        process.env.JUDGE_CONCURRENCY = previousConcurrency;
      }
      if (previousMaxQueueSize === undefined) {
        delete process.env.JUDGE_MAX_QUEUE_SIZE;
      } else {
        process.env.JUDGE_MAX_QUEUE_SIZE = previousMaxQueueSize;
      }
    }
  });
});
