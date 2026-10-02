import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getLadderStudentPage } from "@/lib/ladder";
import { LADDER_PAGE_SIZE } from "@/lib/ladderShared";
import { readPaginationFromUrl } from "@/lib/pagination";
import { ladderErrorResponse, ladderJson } from "@/lib/ladderApi";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  try { return ladderJson(await getLadderStudentPage({ ...readPaginationFromUrl(params, LADDER_PAGE_SIZE), query: params.get("q") ?? "" })); }
  catch (error) { return ladderErrorResponse(error); }
}
