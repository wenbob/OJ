export type AiAssistStreamEvent =
  | {
      event: "status";
      data: {
        phase: "thinking" | "answering";
        message: string;
        elapsedSeconds?: number;
      };
    }
  | { event: "chunk"; data: { text: string } }
  | {
      event: "done";
      data: {
        cached: boolean;
        conversationId: string;
        requestId: string;
      };
    }
  | {
      event: "error";
      data: {
        error: string;
        conversationId: string;
        requestId: string;
        status: number;
      };
    };

export function encodeAiAssistStreamEvent(event: AiAssistStreamEvent) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function splitAiAssistAdvice(advice: string, chunkSize = 8) {
  const characters = Array.from(advice);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += chunkSize) {
    chunks.push(characters.slice(index, index + chunkSize).join(""));
  }
  return chunks;
}

export async function readAiAssistEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: AiAssistStreamEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const parsed = parseAiAssistStreamFrame(frame);
      if (parsed) onEvent(parsed);
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const parsed = parseAiAssistStreamFrame(buffer);
    if (parsed) onEvent(parsed);
  }
}

function parseAiAssistStreamFrame(frame: string): AiAssistStreamEvent | null {
  const lines = frame.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
  const dataText = lines
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");
  if (!event || !dataText) return null;

  try {
    const data = JSON.parse(dataText) as unknown;
    if (
      event !== "status" &&
      event !== "chunk" &&
      event !== "done" &&
      event !== "error"
    ) {
      return null;
    }
    return { event, data } as AiAssistStreamEvent;
  } catch {
    return null;
  }
}
