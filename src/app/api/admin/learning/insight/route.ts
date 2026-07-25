import { NextRequest, NextResponse } from "next/server";
import {
  createAiProviderFingerprint,
  getEffectiveAiProviderConfig,
} from "@/lib/aiProvider";
import { isLearningWindow } from "@/lib/learningAnalytics";
import { prisma } from "@/lib/prisma";
import {
  buildTeacherInsightPrompt,
  createTeacherInsightInput,
  hashTeacherInsightInput,
  requestTeacherLearningInsight,
} from "@/lib/teacherLearningInsight";
import { reserveTeacherInsight } from "@/lib/teacherInsightRateLimit";
import { getTeacherLearningStudentDetail } from "@/lib/teacherLearning";
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
  const record = typeof body === "object" && body
    ? (body as Record<string, unknown>)
    : {};
  const studentId = Number(record.studentId);
  const window = isLearningWindow(record.window) ? record.window : "30d";
  const force = record.force === true;
  if (!Number.isInteger(studentId)) {
    return NextResponse.json({ error: "学生 ID 不合法" }, { status: 400 });
  }
  const detail = await getTeacherLearningStudentDetail(studentId, window);
  if (!detail) return NextResponse.json({ error: "学生不存在" }, { status: 404 });
  const input = createTeacherInsightInput({
    analytics: detail.analytics,
    username: detail.student.username,
  });
  const aiProviderConfig = await getEffectiveAiProviderConfig();
  const inputHash = hashTeacherInsightInput(
    input,
    createAiProviderFingerprint(aiProviderConfig),
  );
  const existing = await prisma.learningInsightSnapshot.findUnique({
    where: { studentId_window: { studentId, window } },
  });
  if (!force && existing?.inputHash === inputHash) {
    return NextResponse.json({
      aiSummary: existing.summary,
      cached: true,
      generatedAt: existing.generatedAt,
      rules: input,
      stale: false,
    });
  }
  const reservation = reserveTeacherInsight({
    adminId: auth.user.id,
    force,
    studentId,
  });
  if (!reservation.allowed) {
    return NextResponse.json(
      {
        error:
          reservation.reason === "cooldown"
            ? `重新生成过于频繁，请 ${reservation.retryAfterSeconds} 秒后再试`
            : "AI 正在生成其他学情摘要，请稍后再试",
        retryAfterSeconds: reservation.retryAfterSeconds,
      },
      { status: 429 },
    );
  }
  try {
    const aiSummary = await requestTeacherLearningInsight(
      buildTeacherInsightPrompt(input),
      aiProviderConfig,
    );
    const snapshot = await prisma.learningInsightSnapshot.upsert({
      where: { studentId_window: { studentId, window } },
      create: { inputHash, studentId, summary: aiSummary, window },
      update: { generatedAt: new Date(), inputHash, summary: aiSummary },
    });
    return NextResponse.json({
      aiSummary,
      cached: false,
      generatedAt: snapshot.generatedAt,
      rules: input,
      stale: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message.trim() : "AI 学情摘要生成失败",
        rules: input,
        stale: Boolean(existing && existing.inputHash !== inputHash),
      },
      { status: 502 },
    );
  } finally {
    reservation.release();
  }
}
