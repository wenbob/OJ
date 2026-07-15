export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export const AI_CHAT_MAX_STORED_MESSAGES = 20;
export const AI_CHAT_MAX_CONTEXT_MESSAGES = 12;

export function createAiChatStorageKey({
  examId,
  problemId,
  studentId,
}: {
  examId?: number;
  problemId: number;
  studentId?: number;
}) {
  if (!Number.isInteger(studentId)) return null;
  return `oj-ai-chat:v1:student-${studentId}:scope-${
    examId ? `exam-${examId}` : "practice"
  }:problem-${problemId}`;
}

export function readStoredAiChat(raw: string | null) {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isAiChatMessage)
      .slice(-AI_CHAT_MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

export function appendAiChatExchange(
  messages: AiChatMessage[],
  userMessage: AiChatMessage,
  assistantMessage: AiChatMessage,
) {
  return [...messages, userMessage, assistantMessage].slice(
    -AI_CHAT_MAX_STORED_MESSAGES,
  );
}

export function toAiChatHistory(messages: AiChatMessage[]) {
  return messages.slice(-AI_CHAT_MAX_CONTEXT_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function isAiChatMessage(value: unknown): value is AiChatMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    (record.role === "user" || record.role === "assistant") &&
    typeof record.content === "string" &&
    Boolean(record.content.trim()) &&
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt)
  );
}
