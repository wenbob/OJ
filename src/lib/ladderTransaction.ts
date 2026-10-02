import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

export class LadderError extends Error {
  constructor(message: string, public status = 409, public currentPoints?: number) { super(message); }
}

export async function ladderTransaction<T>(task: (tx: Prisma.TransactionClient) => Promise<T>, db: PrismaClient = prisma) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(task, { maxWait: 10_000, timeout: 10_000 }); }
    catch (error) {
      const retryable = ["P2034", "P1008", "P2028", "P2002"].includes((error as { code?: string }).code ?? "");
      if (!retryable) throw error;
      if (attempt >= 2) throw new LadderError("操作繁忙，请稍后重试", 503);
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}
