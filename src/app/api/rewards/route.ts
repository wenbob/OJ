import { NextRequest } from "next/server";
import { rewardApi } from "@/lib/rewardApi";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return rewardApi(request); }
