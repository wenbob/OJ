import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { parseProblemsMarkdown } from "@/lib/markdownParser";
import type { ParsedProblemMarkdown } from "@/lib/markdownParser";
import {
  createImportedProblems,
  validateParsedProblems,
} from "@/lib/problemImport";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

function readDefaults(record: Record<string, unknown>) {
  const defaultDifficulty =
    typeof record.defaultDifficulty === "string"
      ? record.defaultDifficulty
      : typeof record.difficulty === "string"
        ? record.difficulty
        : undefined;
  const defaultCategory =
    typeof record.defaultCategory === "string"
      ? record.defaultCategory
      : typeof record.category === "string"
        ? record.category
        : undefined;

  return { defaultCategory, defaultDifficulty };
}

function readProblemPayload(body: unknown, defaults: ReturnType<typeof readDefaults>) {
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};

  if (Array.isArray(record.problems)) {
    return { errors: [], problems: record.problems as ParsedProblemMarkdown[] };
  }

  if (typeof record.markdown === "string") {
    return parseProblemsMarkdown(record.markdown, defaults);
  }

  return { errors: [], problems: [] };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  try {
    const body = await readJsonWithLimit(
      request,
      REQUEST_LIMITS.markdownImportJsonBytes,
    );
    const record =
      typeof body === "object" && body ? (body as Record<string, unknown>) : {};
    const defaults = readDefaults(record);
    const parsed = readProblemPayload(body, defaults);
    const errors = [
      ...parsed.errors,
      ...validateParsedProblems(parsed.problems, defaults),
    ];

    if (errors.length > 0) {
      return NextResponse.json({ errors, error: errors.join("；") }, { status: 400 });
    }

    const problemIds = await prisma.$transaction((tx) =>
      createImportedProblems(tx, parsed.problems, defaults),
    );

    return NextResponse.json(
      {
        count: problemIds.length,
        problemIds,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    const message =
      error instanceof Error ? error.message : "Markdown 导入失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
