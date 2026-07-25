import { NextRequest, NextResponse } from "next/server";
import {
  createLearningAssignment,
  validateLearningAssignmentDraft,
} from "@/lib/learningAssignments";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { requireStaffApiUser } from "@/lib/staffAccess";

export async function POST(request: NextRequest) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const validation = validateLearningAssignmentDraft(body);
  if (!validation.data) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  try {
    const assignment = await prisma.$transaction((tx) =>
      createLearningAssignment({
        createdById: auth.user.id,
        db: tx,
        draft: validation.data,
      }),
    );
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "专项练习下发失败" },
      { status: 400 },
    );
  }
}
