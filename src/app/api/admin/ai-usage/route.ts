import { NextRequest, NextResponse } from "next/server";
import { getAiUsageDashboard, readAiUsageFilters } from "@/lib/aiUsage";
import { requireStaffApiUser } from "@/lib/staffAccess";

export async function GET(request: NextRequest) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const filters = readAiUsageFilters(new URL(request.url).searchParams);
  const dashboard = await getAiUsageDashboard(filters);
  return NextResponse.json(dashboard);
}
