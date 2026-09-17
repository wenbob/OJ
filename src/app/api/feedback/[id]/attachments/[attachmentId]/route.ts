import { NextRequest } from "next/server";
import { getFeedbackAttachment } from "@/lib/feedback";
import { feedbackApi } from "@/lib/feedbackApi";
import { feedbackId } from "@/lib/feedbackErrors";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  return feedbackApi(request, ["student", "teacher", "admin"], async (user) => {
    const values = await params;
    const image = await getFeedbackAttachment(user, feedbackId(values.id), feedbackId(values.attachmentId));
    return new Response(new Uint8Array(image.data), { headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.byteSize),
      "Content-Disposition": 'inline; filename="feedback-screenshot.webp"',
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  });
}
