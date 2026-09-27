import { NextRequest } from "next/server";
import { announcementApi } from "@/lib/announcementApi";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return announcementApi(request, "read", (await context.params).id);
}
