import { NextRequest } from "next/server";
import { announcementApi } from "@/lib/announcementApi";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return announcementApi(request, "list");
}
