const tails = new Map<number, Promise<void>>();

export async function runExamStartSerialized<T>(
  userId: number,
  task: () => Promise<T>,
) {
  const previous = tails.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(userId, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (tails.get(userId) === current) tails.delete(userId);
  }
}

export function clearExamStartLocks() {
  tails.clear();
}
