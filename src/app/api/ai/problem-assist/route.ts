import { NextRequest } from "next/server";
import { handleProblemAssist } from "@/lib/problemAiAssistRoute";

export async function POST(request: NextRequest) {
  return handleProblemAssist(request, { audience: "student" });
}
