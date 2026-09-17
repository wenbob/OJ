import { NextRequest, NextResponse } from "next/server";
import { listFeedback } from "@/lib/feedback";
import { feedbackApi } from "@/lib/feedbackApi";

export async function GET(request: NextRequest) {
  return feedbackApi(request, "admin", async (user) =>
    NextResponse.json(await listFeedback(user, request.nextUrl.searchParams)));
}
