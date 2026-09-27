import { NextRequest } from "next/server";
import { announcementApi } from "@/lib/announcementApi";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return announcementApi(request, "detail", (await context.params).id);
}
