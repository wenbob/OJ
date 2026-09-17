import { NextRequest, NextResponse } from "next/server";
import { getFeedback } from "@/lib/feedback";
import { feedbackApi } from "@/lib/feedbackApi";
import { feedbackId } from "@/lib/feedbackErrors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return feedbackApi(request, ["student", "teacher", "admin"], async (user) =>
    NextResponse.json(await getFeedback(user, feedbackId((await params).id))));
}
