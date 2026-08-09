type QueueItem<T> = {
  priority: JudgeQueuePriority;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
  task: () => Promise<T>;
  waitTimer: ReturnType<typeof setTimeout> | null;
};

export type JudgeQueuePriority = "submission" | "trial";

export class JudgeQueueFullError extends Error {
  constructor() {
    super("评测队列繁忙，请稍后再提交");
    this.name = "JudgeQueueFullError";
  }
}

export class JudgeQueueTimeoutError extends Error {
  constructor() {
    super("评测任务排队超时，请稍后重试");
    this.name = "JudgeQueueTimeoutError";
  }
}

const queue: QueueItem<unknown>[] = [];
let runningCount = 0;

function readConcurrency() {
  const parsed = Number(process.env.JUDGE_CONCURRENCY);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function readMaxQueueSize() {
  const parsed = Number(process.env.JUDGE_MAX_QUEUE_SIZE);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 50;
}

function readQueueWaitTimeoutMs() {
  const parsed = Number(process.env.JUDGE_QUEUE_WAIT_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 60_000;
}

function drainQueue() {
  const concurrency = readConcurrency();

  while (runningCount < concurrency && queue.length > 0) {
    const item = queue.shift();
    if (!item) return;

    if (item.waitTimer) {
      clearTimeout(item.waitTimer);
      item.waitTimer = null;
    }
    runningCount += 1;
    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        runningCount -= 1;
        drainQueue();
      });
  }
}

export function enqueueJudgeTask<T>(
  task: () => Promise<T>,
  { priority = "submission" }: { priority?: JudgeQueuePriority } = {},
) {
  return new Promise<T>((resolve, reject) => {
    const canStartImmediately =
      runningCount < readConcurrency() && queue.length === 0;
    if (!canStartImmediately && queue.length >= readMaxQueueSize()) {
      reject(new JudgeQueueFullError());
      return;
    }

    const item: QueueItem<unknown> = {
      priority,
      reject,
      resolve: resolve as (value: unknown) => void,
      task,
      waitTimer: null,
    };
    if (priority === "submission") {
      const firstTrialIndex = queue.findIndex(
        (queuedItem) => queuedItem.priority === "trial",
      );
      if (firstTrialIndex >= 0) {
        queue.splice(firstTrialIndex, 0, item);
      } else {
        queue.push(item);
      }
    } else {
      queue.push(item);
    }
    item.waitTimer = setTimeout(() => {
      const queuedIndex = queue.indexOf(item);
      if (queuedIndex < 0) return;
      queue.splice(queuedIndex, 1);
      item.waitTimer = null;
      item.reject(new JudgeQueueTimeoutError());
      drainQueue();
    }, readQueueWaitTimeoutMs());
    drainQueue();
  });
}

export function getJudgeQueueStats() {
  return {
    concurrency: readConcurrency(),
    maxQueueSize: readMaxQueueSize(),
    pending: queue.length,
    queueWaitTimeoutMs: readQueueWaitTimeoutMs(),
    running: runningCount,
  };
}
