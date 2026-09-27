import { NextRequest } from "next/server";
import { rewardApi } from "@/lib/rewardApi";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return rewardApi(request, "challenge", (await context.params).id);
}
