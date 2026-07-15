import { NextResponse } from "next/server";
import { getPublicSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json(await getPublicSettings(), {
    headers: { "Cache-Control": "no-store" },
  });
}
