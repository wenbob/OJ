import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getLadderSettings, saveLadderSettings } from "@/lib/ladderSettings";
import { validateTierThresholds } from "@/lib/ladderShared";
import { ladderErrorResponse, ladderJson, revalidateLadderPages } from "@/lib/ladderApi";
import { readJsonWithLimit, REQUEST_LIMITS } from "@/lib/requestLimits";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;
  try { return ladderJson(await getLadderSettings()); } catch (error) { return ladderErrorResponse(error); }
}
export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
    if (!body || typeof body !== "object" || Array.isArray(body)) return ladderJson({ error: "请求格式不合法" }, 400);
    if (typeof body.revision !== "string" || !body.revision || body.revision.length > 128) return ladderJson({ error: "请重新加载段位门槛后再保存" }, 409);
    const error = validateTierThresholds(body.minPoints);
    if (error || Object.keys(body).some((key) => key !== "revision" && key !== "minPoints")) return ladderJson({ error: error ?? "请求包含不支持的字段" }, 400);
    const settings = await saveLadderSettings(body.revision, body.minPoints);
    revalidateLadderPages();
    return ladderJson(settings);
  } catch (error) { return ladderErrorResponse(error); }
}
