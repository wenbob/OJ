export class PayloadTooLargeError extends Error {
  constructor(message = "请求内容过大") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

export const REQUEST_LIMITS = {
  authJsonBytes: 4 * 1024,
  aiAssistJsonBytes: 64 * 1024,
  codeBytes: 128 * 1024,
  markdownImportJsonBytes: 2 * 1024 * 1024,
  problemPayloadJsonBytes: 2 * 1024 * 1024,
  settingsJsonBytes: 512 * 1024,
  smallJsonBytes: 64 * 1024,
} as const;

export function byteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

export function ensureTextWithinByteLimit(
  value: string,
  maxBytes: number,
  label = "内容",
) {
  if (byteLength(value) > maxBytes) {
    throw new PayloadTooLargeError(`${label}不能超过 ${maxBytes} 字节`);
  }
}

export async function readJsonWithLimit(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PayloadTooLargeError();
  }

  const text = await request.text();
  ensureTextWithinByteLimit(text, maxBytes, "请求内容");
  if (!text.trim()) return null;

  return JSON.parse(text);
}

export function payloadTooLargeResponse(error: unknown) {
  return {
    error:
      error instanceof PayloadTooLargeError ? error.message : "请求内容过大",
  };
}
