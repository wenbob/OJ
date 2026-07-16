import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionResponse,
  readSessionToken,
  SESSION_COOKIE,
} from "@/lib/auth";
import { finishExamRecord } from "@/lib/examScoring";
import { prisma } from "@/lib/prisma";
import {
  isSameOriginMutationRequest,
  sameOriginMutationErrorResponse,
} from "@/lib/requestSecurity";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutationRequest(request)) {
    return sameOriginMutationErrorResponse();
  }

  const claims = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (
    claims?.role === "student" &&
    typeof claims.sessionVersion === "number"
  ) {
    const invalidated = await prisma.user.updateMany({
      where: {
        id: claims.id,
        role: "student",
        sessionVersion: claims.sessionVersion,
      },
      data: { sessionVersion: { increment: 1 } },
    });
    if (invalidated.count === 1) {
      const inProgressRecords = await prisma.examRecord.findMany({
        where: { status: "in_progress", userId: claims.id },
        select: { examId: true },
      });
      for (const record of inProgressRecords) {
        await finishExamRecord({
          examId: record.examId,
          status: "submitted",
          userId: claims.id,
        });
      }
    }
  }

  return clearSessionResponse(NextResponse.json({ ok: true }));
}
