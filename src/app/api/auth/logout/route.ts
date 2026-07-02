import { NextResponse } from "next/server";
import { clearSessionResponse } from "@/lib/auth";
import {
  isSameOriginMutationRequest,
  sameOriginMutationErrorResponse,
} from "@/lib/requestSecurity";

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return sameOriginMutationErrorResponse();
  }

  return clearSessionResponse(NextResponse.json({ ok: true }));
}
