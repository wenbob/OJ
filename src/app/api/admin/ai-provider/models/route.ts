import { NextRequest, NextResponse } from "next/server";
import {
  AiProviderError,
  createAiProviderDraftConfig,
  listAvailableAiModels,
  type AiProviderId,
} from "@/lib/aiProvider";
import { requireApiUser } from "@/lib/auth";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

function isProvider(value: unknown): value is AiProviderId {
  return value === "deepseek" || value === "doubao" || value === "custom";
}

function aiProviderErrorResponse(error: unknown) {
  if (!(error instanceof AiProviderError)) {
    return NextResponse.json(
      { error: "获取模型列表失败，请稍后重试" },
      { status: 502 },
    );
  }

  if (error.kind === "missing-credential") {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error.kind === "invalid-config" || error.kind === "unsafe-target") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error.kind === "timeout") {
    return NextResponse.json({ error: error.message }, { status: 504 });
  }
  return NextResponse.json({ error: error.message }, { status: 502 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }

  const record =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  if (!isProvider(record.provider)) {
    return NextResponse.json({ error: "AI 服务商不合法" }, { status: 400 });
  }
  const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl : "";

  try {
    const config = createAiProviderDraftConfig({
      baseUrl,
      provider: record.provider,
    });
    const models = await listAvailableAiModels(config);
    return NextResponse.json({ models });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return aiProviderErrorResponse(error);
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "AI Base URL 不合法",
      },
      { status: 400 },
    );
  }
}
