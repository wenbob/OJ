import { NextResponse } from "next/server";
import { validateProductionEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const envStatus = validateProductionEnv();
  if (!envStatus.ok) {
    return NextResponse.json(
      {
        ok: false,
        database: "unknown",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
