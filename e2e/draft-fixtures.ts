import type { Page } from "@playwright/test";
import { getProblemDraftKey, serializeProblemDraft, type ProblemDraftContext } from "../src/lib/problemDraft";
import type { ProblemType } from "../src/lib/objectiveProblem";

export async function seedBrowserDraft(page: Page, context: ProblemDraftContext, problemType: ProblemType, problemId: number, content: string) {
  const key = getProblemDraftKey(context, problemType, problemId);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value: serializeProblemDraft(key, content) });
  return key;
}
