import { NextRequest, NextResponse } from "next/server";
import { getSessionStateFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const state = await getSessionStateFromRequest(request);
  if (!state.user) {
    return NextResponse.json(
      {
        error:
          state.reason === "session_replaced"
            ? "账号已在其他设备登录，请重新登录"
            : state.reason === "unauthenticated"
              ? "请先登录"
              : "登录状态已失效，请重新登录",
        reason: state.reason,
        user: null,
      },
      { status: 401 },
    );
  }
  return NextResponse.json({ user: state.user });
}
