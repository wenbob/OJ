import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const exams = await prisma.exam.findMany({
    where: { status: "published", archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      durationMin: true,
      status: true,
      examType: true,
      createdAt: true,
      _count: { select: { problems: true } },
    },
  });

  return NextResponse.json({ exams });
}
