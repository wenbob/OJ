import { describe, expect, it } from "vitest";
import {
  AI_CHAT_MAX_CONTEXT_MESSAGES,
  AI_CHAT_MAX_STORED_MESSAGES,
  appendAiChatExchange,
  createAiChatStorageKey,
  readStoredAiChat,
  toAiChatHistory,
  type AiChatMessage,
} from "./aiChat";

function message(index: number): AiChatMessage {
  return {
    id: String(index),
    role: index % 2 === 0 ? "user" : "assistant",
    content: `消息 ${index}`,
    createdAt: index,
  };
}

describe("AI chat browser history", () => {
  it("isolates storage by student, problem, and exam scope", () => {
    expect(
      createAiChatStorageKey({ studentId: 2, problemId: 10 }),
    ).toBe("oj-ai-chat:v1:student-2:scope-practice:problem-10");
    expect(
      createAiChatStorageKey({ studentId: 2, problemId: 10, examId: 3 }),
    ).toBe("oj-ai-chat:v1:student-2:scope-exam-3:problem-10");
    expect(createAiChatStorageKey({ problemId: 10 })).toBeNull();
  });

  it("drops malformed stored data and keeps only the latest messages", () => {
    expect(readStoredAiChat("not-json")).toEqual([]);
    const stored = Array.from(
      { length: AI_CHAT_MAX_STORED_MESSAGES + 3 },
      (_, index) => message(index),
    );

    const parsed = readStoredAiChat(JSON.stringify(stored));

    expect(parsed).toHaveLength(AI_CHAT_MAX_STORED_MESSAGES);
    expect(parsed[0].id).toBe("3");
  });

  it("stores twenty messages but sends only the latest twelve as context", () => {
    const initial = Array.from(
      { length: AI_CHAT_MAX_STORED_MESSAGES - 1 },
      (_, index) => message(index),
    );
    const updated = appendAiChatExchange(
      initial,
      message(100),
      message(101),
    );
    const history = toAiChatHistory(updated);

    expect(updated).toHaveLength(AI_CHAT_MAX_STORED_MESSAGES);
    expect(history).toHaveLength(AI_CHAT_MAX_CONTEXT_MESSAGES);
    expect(history.at(-1)).toEqual({ role: "assistant", content: "消息 101" });
  });
});
