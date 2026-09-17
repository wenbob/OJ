import { NextRequest, NextResponse } from "next/server";
import { replyToFeedback } from "@/lib/feedback";
import { feedbackApi } from "@/lib/feedbackApi";
import { feedbackId } from "@/lib/feedbackErrors";
import { readFeedbackJson } from "@/lib/feedbackUpload";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return feedbackApi(request, "admin", async (user) => {
    const id = feedbackId((await params).id);
    const body = await readFeedbackJson(request);
    await replyToFeedback(user, id, body.content);
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
