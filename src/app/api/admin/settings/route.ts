import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const settings = await getAllSystemSettings();
  return NextResponse.json({ settings });
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

  const settings = normalizeSystemSettingsPayload(body);
  const error = validateSystemSettings(settings);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await prisma.$transaction(
    systemSettingsEntries(settings).map((item) =>
      prisma.systemSetting.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: item,
      }),
    ),
  );

  return NextResponse.json({ settings });
}
