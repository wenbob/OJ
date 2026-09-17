import { NextRequest, NextResponse } from "next/server";
import { updateFeedbackStatus } from "@/lib/feedback";
import { feedbackApi } from "@/lib/feedbackApi";
import { feedbackId } from "@/lib/feedbackErrors";
import { readFeedbackJson } from "@/lib/feedbackUpload";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return feedbackApi(request, "admin", async (user) => {
    const id = feedbackId((await params).id);
    const body = await readFeedbackJson(request);
    await updateFeedbackStatus(user, id, body.status);
    return NextResponse.json({ ok: true });
  });
}
