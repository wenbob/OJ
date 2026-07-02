type QueueItem<T> = {
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
  task: () => Promise<T>;
};

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

function drainQueue() {
  const concurrency = readConcurrency();

  while (runningCount < concurrency && queue.length > 0) {
    const item = queue.shift();
    if (!item) return;

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

export function enqueueJudgeTask<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    if (queue.length >= readMaxQueueSize()) {
      reject(new Error("评测队列繁忙，请稍后再提交"));
      return;
    }

    queue.push({
      reject,
      resolve: resolve as (value: unknown) => void,
      task,
    });
    drainQueue();
  });
}

export function getJudgeQueueStats() {
  return {
    concurrency: readConcurrency(),
    maxQueueSize: readMaxQueueSize(),
    pending: queue.length,
    running: runningCount,
  };
}
