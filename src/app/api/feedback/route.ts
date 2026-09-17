import { NextRequest, NextResponse } from "next/server";
import { createFeedback, listFeedback } from "@/lib/feedback";
import { feedbackApi } from "@/lib/feedbackApi";
import { reserveFeedbackSubmission } from "@/lib/feedbackRateLimit";
import { readFeedbackSubmission } from "@/lib/feedbackUpload";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return feedbackApi(request, ["student", "teacher"], async (user) =>
    NextResponse.json(await listFeedback(user, request.nextUrl.searchParams)));
}

export async function POST(request: NextRequest) {
  return feedbackApi(request, ["student", "teacher"], async (user) => {
    const reservation = reserveFeedbackSubmission(user.id);
    let success = false;
    try {
      const submission = await readFeedbackSubmission(request);
      const result = await createFeedback(user, submission);
      success = true;
      return NextResponse.json(result, { status: 201 });
    } finally {
      reservation.release(success);
    }
  });
}
