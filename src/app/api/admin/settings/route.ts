import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  applyAiProviderStatusToSettings,
  getEffectiveAiProviderConfig,
  normalizeAiProviderSettings,
  toAiProviderAdminStatus,
} from "@/lib/aiProvider";
import {
  getAllSystemSettings,
  normalizeSystemSettingsPayload,
  systemSettingsEntries,
  validateSystemSettings,
} from "@/lib/settings";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { resolveSafeAiProviderTarget } from "@/lib/safeAiProviderHttp";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const [settings, config] = await Promise.all([
    getAllSystemSettings(),
    getEffectiveAiProviderConfig(),
  ]);
  const aiProviderStatus = toAiProviderAdminStatus(config);
  return NextResponse.json({
    aiProviderStatus,
    settings: applyAiProviderStatusToSettings(settings, aiProviderStatus),
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

  const normalizedSettings = normalizeSystemSettingsPayload(body);
  const error = validateSystemSettings(normalizedSettings);
  if (error) return NextResponse.json({ error }, { status: 400 });

  let settings;
  try {
    settings = normalizeAiProviderSettings(normalizedSettings);
    if (settings.aiProvider === "custom") {
      await resolveSafeAiProviderTarget(settings.aiBaseUrl);
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

  await prisma.$transaction(
    systemSettingsEntries(settings).map((item) =>
      prisma.systemSetting.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: item,
      }),
    ),
  );

  const config = await getEffectiveAiProviderConfig();
  const aiProviderStatus = toAiProviderAdminStatus(config);
  return NextResponse.json({
    aiProviderStatus,
    settings: applyAiProviderStatusToSettings(settings, aiProviderStatus),
  });
}
