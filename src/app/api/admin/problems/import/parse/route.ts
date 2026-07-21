import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { parseProblemImportDocuments } from "@/lib/problemImportBatch";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.markdownImportJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const markdown = typeof record.markdown === "string" ? record.markdown : "";
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
  const documents = Array.isArray(record.documents)
    ? record.documents.map((item, index) => {
        const document =
          typeof item === "object" && item
            ? (item as Record<string, unknown>)
            : {};
        return {
          name:
            typeof document.name === "string"
              ? document.name
              : `文档 ${index + 1}.md`,
          markdown:
            typeof document.markdown === "string" ? document.markdown : "",
        };
      })
    : [{ name: "手动输入.md", markdown }];
  const result = parseProblemImportDocuments(documents, {
    defaultCategory,
    defaultDifficulty,
  });
  return NextResponse.json(result);
}
