import { describe, expect, it } from "vitest";
import {
  enqueueJudgeTask,
  JudgeQueueOwnerLimitError,
  JudgeQueueTimeoutError,
} from "./judgeQueue";

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

  it("removes and rejects a task that waits in the queue too long", async () => {
    const previousConcurrency = process.env.JUDGE_CONCURRENCY;
    const previousWaitTimeout = process.env.JUDGE_QUEUE_WAIT_TIMEOUT_MS;
    process.env.JUDGE_CONCURRENCY = "1";
    process.env.JUDGE_QUEUE_WAIT_TIMEOUT_MS = "10";
    let releaseRunning: (() => void) | undefined;
    let timedTaskStarted = false;

    const running = enqueueJudgeTask(
      () =>
        new Promise<void>((resolve) => {
          releaseRunning = resolve;
        }),
    );
    const timedTask = enqueueJudgeTask(async () => {
      timedTaskStarted = true;
    });

    try {
      await expect(timedTask).rejects.toBeInstanceOf(JudgeQueueTimeoutError);
      expect(timedTaskStarted).toBe(false);
    } finally {
      releaseRunning?.();
      await running;
      if (previousConcurrency === undefined) {
        delete process.env.JUDGE_CONCURRENCY;
      } else {
        process.env.JUDGE_CONCURRENCY = previousConcurrency;
      }
      if (previousWaitTimeout === undefined) {
        delete process.env.JUDGE_QUEUE_WAIT_TIMEOUT_MS;
      } else {
        process.env.JUDGE_QUEUE_WAIT_TIMEOUT_MS = previousWaitTimeout;
      }
    }
  });

  it("caps one owner's pending tasks without blocking another owner", async () => {
    const previousConcurrency = process.env.JUDGE_CONCURRENCY;
    const previousPendingLimit = process.env.JUDGE_MAX_PENDING_PER_OWNER;
    process.env.JUDGE_CONCURRENCY = "2";
    process.env.JUDGE_MAX_PENDING_PER_OWNER = "1";
    let releaseOwnerA: (() => void) | undefined;
    let ownerBStarted = false;

    const runningA = enqueueJudgeTask(
      () =>
        new Promise<void>((resolve) => {
          releaseOwnerA = resolve;
        }),
      { ownerKey: "user:a" },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pendingA = enqueueJudgeTask(async () => {}, { ownerKey: "user:a" });

    try {
      await expect(
        enqueueJudgeTask(async () => {}, { ownerKey: "user:a" }),
      ).rejects.toBeInstanceOf(JudgeQueueOwnerLimitError);
      await enqueueJudgeTask(
        async () => {
          ownerBStarted = true;
        },
        { ownerKey: "user:b" },
      );
      expect(ownerBStarted).toBe(true);
    } finally {
      releaseOwnerA?.();
      await Promise.all([runningA, pendingA]);
      if (previousConcurrency === undefined) delete process.env.JUDGE_CONCURRENCY;
      else process.env.JUDGE_CONCURRENCY = previousConcurrency;
      if (previousPendingLimit === undefined) {
        delete process.env.JUDGE_MAX_PENDING_PER_OWNER;
      } else {
        process.env.JUDGE_MAX_PENDING_PER_OWNER = previousPendingLimit;
      }
    }
  });

  it("round-robins owners within the same priority", async () => {
    const previousConcurrency = process.env.JUDGE_CONCURRENCY;
    process.env.JUDGE_CONCURRENCY = "1";
    const order: string[] = [];
    let releaseSeed: (() => void) | undefined;
    const seed = enqueueJudgeTask(
      () =>
        new Promise<void>((resolve) => {
          releaseSeed = resolve;
        }),
      { ownerKey: "seed" },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const a1 = enqueueJudgeTask(async () => void order.push("a1"), {
      ownerKey: "a",
    });
    const a2 = enqueueJudgeTask(async () => void order.push("a2"), {
      ownerKey: "a",
    });
    const b1 = enqueueJudgeTask(async () => void order.push("b1"), {
      ownerKey: "b",
    });

    try {
      releaseSeed?.();
      await Promise.all([seed, a1, a2, b1]);
      expect(order).toEqual(["a1", "b1", "a2"]);
    } finally {
      if (previousConcurrency === undefined) delete process.env.JUDGE_CONCURRENCY;
      else process.env.JUDGE_CONCURRENCY = previousConcurrency;
    }
  });
});
