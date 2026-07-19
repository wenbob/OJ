import { NextRequest, NextResponse } from "next/server";
import { getAiUsageDashboard, readAiUsageFilters } from "@/lib/aiUsage";
import { requireApiUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const filters = readAiUsageFilters(new URL(request.url).searchParams);
  const dashboard = await getAiUsageDashboard(filters);
  return NextResponse.json(dashboard);
}
