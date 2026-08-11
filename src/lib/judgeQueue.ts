type QueueItem<T> = {
  ownerKey?: string;
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

export class JudgeQueueOwnerLimitError extends Error {
  constructor() {
    super("你已有过多评测任务，请等待当前任务完成");
    this.name = "JudgeQueueOwnerLimitError";
  }
}

const queue: QueueItem<unknown>[] = [];
let runningCount = 0;
const runningByOwner = new Map<string, number>();
const lastStartedOwnerByPriority = new Map<JudgeQueuePriority, string>();

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

function readBoundedPositiveInt(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function readMaxRunningPerOwner() {
  return readBoundedPositiveInt(
    process.env.JUDGE_MAX_RUNNING_PER_OWNER,
    1,
    8,
  );
}

function readMaxPendingPerOwner() {
  return readBoundedPositiveInt(
    process.env.JUDGE_MAX_PENDING_PER_OWNER,
    2,
    20,
  );
}

function ownerCanStart(ownerKey?: string) {
  return (
    !ownerKey ||
    (runningByOwner.get(ownerKey) ?? 0) < readMaxRunningPerOwner()
  );
}

function pendingForOwner(ownerKey: string) {
  return queue.filter((item) => item.ownerKey === ownerKey).length;
}

function pickNextQueueIndex() {
  for (const priority of ["submission", "trial"] as const) {
    const eligible = queue
      .map((item, index) => ({ index, item }))
      .filter(
        ({ item }) =>
          item.priority === priority && ownerCanStart(item.ownerKey),
      );
    if (eligible.length === 0) continue;
    const lastOwner = lastStartedOwnerByPriority.get(priority);
    const next =
      eligible.find(({ item }) => !item.ownerKey || item.ownerKey !== lastOwner) ??
      eligible[0];
    return next.index;
  }
  return -1;
}

function drainQueue() {
  const concurrency = readConcurrency();

  while (runningCount < concurrency && queue.length > 0) {
    const nextIndex = pickNextQueueIndex();
    if (nextIndex < 0) return;
    const [item] = queue.splice(nextIndex, 1);
    if (!item) return;

    if (item.waitTimer) {
      clearTimeout(item.waitTimer);
      item.waitTimer = null;
    }
    runningCount += 1;
    if (item.ownerKey) {
      runningByOwner.set(
        item.ownerKey,
        (runningByOwner.get(item.ownerKey) ?? 0) + 1,
      );
      lastStartedOwnerByPriority.set(item.priority, item.ownerKey);
    }
    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        runningCount -= 1;
        if (item.ownerKey) {
          const nextRunning = (runningByOwner.get(item.ownerKey) ?? 0) - 1;
          if (nextRunning > 0) runningByOwner.set(item.ownerKey, nextRunning);
          else runningByOwner.delete(item.ownerKey);
        }
        drainQueue();
      });
  }
}

export function enqueueJudgeTask<T>(
  task: () => Promise<T>,
  {
    ownerKey,
    priority = "submission",
  }: { ownerKey?: string; priority?: JudgeQueuePriority } = {},
) {
  return new Promise<T>((resolve, reject) => {
    if (
      ownerKey &&
      pendingForOwner(ownerKey) >= readMaxPendingPerOwner()
    ) {
      reject(new JudgeQueueOwnerLimitError());
      return;
    }
    const canStartImmediately =
      runningCount < readConcurrency() &&
      queue.length === 0 &&
      ownerCanStart(ownerKey);
    if (!canStartImmediately && queue.length >= readMaxQueueSize()) {
      reject(new JudgeQueueFullError());
      return;
    }

    const item: QueueItem<unknown> = {
      ownerKey,
      priority,
      reject,
      resolve: resolve as (value: unknown) => void,
      task,
      waitTimer: null,
    };
    queue.push(item);
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
    runningOwners: runningByOwner.size,
  };
}
