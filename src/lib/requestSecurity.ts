import { NextResponse } from "next/server";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

export function expectedRequestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || request.headers.get("host") || url.host;
  const protocol = forwardedProto || url.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

export function isSameOriginMutationRequest(request: Request) {
  if (safeMethods.has(request.method.toUpperCase())) return true;

  const expectedOrigin = expectedRequestOrigin(request);
  const origin = request.headers.get("origin");
  if (origin) return origin === expectedOrigin;

  const referer = request.headers.get("referer");
  if (!referer) return false;

  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function sameOriginMutationErrorResponse() {
  return NextResponse.json({ error: "请求来源不合法" }, { status: 403 });
}
