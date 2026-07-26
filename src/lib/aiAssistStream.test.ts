import { describe, expect, it } from "vitest";
import {
  encodeAiAssistStreamEvent,
  readAiAssistEventStream,
  splitAiAssistAdvice,
  type AiAssistStreamEvent,
} from "./aiAssistStream";

describe("AI assist stream protocol", () => {
  it("splits Unicode advice without breaking Chinese characters", () => {
    expect(splitAiAssistAdvice("第一步🙂先读题", 3)).toEqual([
      "第一步",
      "🙂先读",
      "题",
    ]);
  });

  it("encodes and incrementally reads SSE frames", async () => {
    const payload = [
      encodeAiAssistStreamEvent({
        event: "status",
        data: { phase: "thinking", message: "正在思考" },
      }),
      encodeAiAssistStreamEvent({ event: "chunk", data: { text: "第一步" } }),
      encodeAiAssistStreamEvent({
        event: "done",
        data: {
          cached: false,
          cooldownSeconds: 20,
          conversationId: "conversation_123456",
          requestId: "request_12345678",
        },
      }),
    ].join("");
    const bytes = new TextEncoder().encode(payload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 17));
        controller.enqueue(bytes.slice(17));
        controller.close();
      },
    });
    const events: AiAssistStreamEvent[] = [];

    await readAiAssistEventStream(stream, (event) => events.push(event));

    expect(events.map((event) => event.event)).toEqual([
      "status",
      "chunk",
      "done",
    ]);
    expect(events[1]).toEqual({ event: "chunk", data: { text: "第一步" } });
  });
});
