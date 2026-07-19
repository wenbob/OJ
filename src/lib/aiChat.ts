export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type AiChatState = {
  conversationId: string;
  messages: AiChatMessage[];
};

export const AI_CHAT_MAX_STORED_MESSAGES = 20;
export const AI_CHAT_MAX_CONTEXT_MESSAGES = 12;
export const AI_CHAT_QUICK_PROMPTS = {
  overview: "我想先理解这道题",
  next_step: "请告诉我接下来最应该做什么",
  code_review: "请帮我检查当前代码哪里有问题",
} as const;

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
  return readStoredAiChatState(raw).messages;
}

export function readStoredAiChatState(raw: string | null): AiChatState {
  if (!raw) return emptyAiChatState();

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        conversationId: createAiChatClientId(),
        messages: parsed
          .filter(isAiChatMessage)
          .slice(-AI_CHAT_MAX_STORED_MESSAGES),
      };
    }
    if (!parsed || typeof parsed !== "object") return emptyAiChatState();
    const record = parsed as Record<string, unknown>;
    const messages = Array.isArray(record.messages) ? record.messages : [];

    return {
      conversationId:
        typeof record.conversationId === "string" && record.conversationId
          ? record.conversationId
          : createAiChatClientId(),
      messages: messages
        .filter(isAiChatMessage)
        .slice(-AI_CHAT_MAX_STORED_MESSAGES),
    };
  } catch {
    return emptyAiChatState();
  }
}

export function serializeAiChatState(state: AiChatState) {
  return JSON.stringify({
    version: 2,
    conversationId: state.conversationId,
    messages: state.messages.slice(-AI_CHAT_MAX_STORED_MESSAGES),
  });
}

export function createAiChatClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
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

function emptyAiChatState(): AiChatState {
  return { conversationId: createAiChatClientId(), messages: [] };
}
