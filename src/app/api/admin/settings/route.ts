import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  applyAiProviderStatusesToSettings,
  getEffectiveAiProviderConfig,
  normalizeAiProviderSettings,
  toAiProviderAdminStatus,
} from "@/lib/aiProvider";
import {
  getAllSystemSettings,
  normalizeSystemSettingsPayload,
  validateSystemSettings,
} from "@/lib/settings";
import {
  getSystemSettingsRevision,
  saveSystemSettingsWithRevision,
  StaleSystemSettingsError,
} from "@/lib/systemSettingsRevision";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { resolveSafeAiProviderTarget } from "@/lib/safeAiProviderHttp";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const [settings, revision, programmingConfig, objectiveConfig] = await Promise.all([
    getAllSystemSettings(),
    getSystemSettingsRevision(),
    getEffectiveAiProviderConfig("programming"),
    getEffectiveAiProviderConfig("objective"),
  ]);
  const aiProviderStatuses = {
    programming: toAiProviderAdminStatus(programmingConfig),
    objective: toAiProviderAdminStatus(objectiveConfig),
  };
  return NextResponse.json({
    aiProviderStatus: aiProviderStatuses.programming,
    aiProviderStatuses,
    revision,
    settings: applyAiProviderStatusesToSettings(settings, aiProviderStatuses),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.settingsJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }

  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const expectedRevision =
    typeof record.revision === "string" ? record.revision.trim() : "";
  if (!expectedRevision || expectedRevision.length > 128 || !record.settings) {
    return NextResponse.json(
      { error: "系统设置页面已过期，请刷新后再保存" },
      { status: 409 },
    );
  }

  const normalizedSettings = normalizeSystemSettingsPayload(record.settings);
  const error = validateSystemSettings(normalizedSettings);
  if (error) return NextResponse.json({ error }, { status: 400 });

  let settings;
  try {
    settings = normalizeAiProviderSettings(normalizedSettings);
    if (settings.aiProvider === "custom") {
      await resolveSafeAiProviderTarget(settings.aiBaseUrl);
    }
    if (settings.aiObjectiveProvider === "custom") {
      await resolveSafeAiProviderTarget(settings.aiObjectiveBaseUrl);
    }
  } catch (providerError) {
    return NextResponse.json(
      {
        error:
          providerError instanceof Error
            ? providerError.message
            : "AI Base URL 不合法",
      },
      { status: 400 },
    );
  }

  let revision;
  try {
    revision = await saveSystemSettingsWithRevision({
      expectedRevision,
      settings,
    });
  } catch (saveError) {
    if (saveError instanceof StaleSystemSettingsError) {
      return NextResponse.json(
        { error: saveError.message },
        { status: 409 },
      );
    }
    console.error("[SYSTEM_SETTINGS_SAVE_ERROR]", {
      message: saveError instanceof Error ? saveError.message : "unknown",
      userId: auth.user.id,
    });
    return NextResponse.json({ error: "保存设置失败" }, { status: 500 });
  }

  const [programmingConfig, objectiveConfig] = await Promise.all([
    getEffectiveAiProviderConfig("programming"),
    getEffectiveAiProviderConfig("objective"),
  ]);
  const aiProviderStatuses = {
    programming: toAiProviderAdminStatus(programmingConfig),
    objective: toAiProviderAdminStatus(objectiveConfig),
  };
  return NextResponse.json({
    aiProviderStatus: aiProviderStatuses.programming,
    aiProviderStatuses,
    revision,
    settings: applyAiProviderStatusesToSettings(settings, aiProviderStatuses),
  });
}
