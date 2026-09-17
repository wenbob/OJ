import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { normalizeFeedbackImage, readFeedbackBody, readFeedbackJson, readFeedbackSubmission } from "@/lib/feedbackUpload";
import { FEEDBACK_LIMITS } from "@/lib/feedbackShared";
import { feedbackId, feedbackText } from "@/lib/feedbackErrors";

async function screenshot(format: "png" | "jpeg" | "webp" = "png") {
  return sharp({ create: { width: 24, height: 16, channels: 3, background: "#b66b41" } })[format]().toBuffer();
}

function formRequest(files: File[] = [], title = "页面问题", content = "操作步骤") {
  const body = new FormData();
  body.set("title", title);
  body.set("content", content);
  files.forEach((file) => body.append("attachments", file));
  return new Request("http://oj.local/api/feedback", { method: "POST", body });
}

describe("feedback upload validation", () => {
  it.each(["png", "jpeg", "webp"] as const)("decodes real %s and stores a metadata-free WebP", async (format) => {
    const file = new File([new Uint8Array(await screenshot(format))], "screenshot", { type: `image/${format}` });
    const result = await normalizeFeedbackImage(file);
    expect(result).toMatchObject({ mimeType: "image/webp", width: 24, height: 16 });
    const metadata = await sharp(result.data).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(result.byteSize).toBe(result.data.byteLength);
  });

  it("accepts text-only feedback and trims text", async () => {
    expect(await readFeedbackSubmission(formRequest([], " 标题 ", " 描述 "))).toEqual({ title: "标题", content: "描述", attachments: [] });
  });

  it("applies orientation and strips embedded metadata", async () => {
    const input = await sharp({ create: { width: 24, height: 16, channels: 3, background: "orange" } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await normalizeFeedbackImage(new File([new Uint8Array(input)], "rotated.jpg", { type: "image/jpeg" }));
    expect(result).toMatchObject({ width: 16, height: 24 });
    const output = await sharp(result.data).metadata();
    expect(output.exif).toBeUndefined();
    expect(output.hasProfile).toBe(false);
  });

  it("rejects APNG control chunks even when the decoder would read only the first frame", async () => {
    const png = await screenshot();
    const animation = Buffer.alloc(20);
    animation.writeUInt32BE(8, 0);
    animation.write("acTL", 4);
    animation.writeUInt32BE(2, 8);
    let crc = 0xffffffff;
    for (const byte of animation.subarray(4, 16)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    animation.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 16);
    const apng = Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)]);
    expect((await sharp(apng).metadata()).format).toBe("png");
    await expect(normalizeFeedbackImage(new File([new Uint8Array(apng)], "animated.png", { type: "image/png" }))).rejects.toThrow();
  });

  it("bounds the stored image size even for high-entropy screenshots", async () => {
    const pixels = Buffer.alloc(1600 * 1600 * 3);
    let seed = 12345;
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[i] = seed >>> 24;
    }
    const input = await sharp(pixels, { raw: { width: 1600, height: 1600, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
    expect(input.byteLength).toBeLessThan(FEEDBACK_LIMITS.fileBytes);
    await expect(normalizeFeedbackImage(new File([new Uint8Array(input)], "noise.jpg", { type: "image/jpeg" }))).rejects.toThrow("压缩后仍超过 1 MiB");
  });

  it("accepts exactly three screenshots and preserves order", async () => {
    const png = new Uint8Array(await screenshot());
    const files = [1, 2, 3].map((i) => new File([png], `${i}.png`, { type: "image/png" }));
    const result = await readFeedbackSubmission(formRequest(files));
    expect(result.attachments.map((image) => image.position)).toEqual([0, 1, 2]);
    await expect(readFeedbackSubmission(formRequest([...files, files[0]]))).rejects.toThrow("最多上传 3 张");
  });

  it("rejects empty, malformed, oversized, mismatched and unsupported images", async () => {
    const png = new Uint8Array(await screenshot());
    for (const file of [
      new File([], "empty.png", { type: "image/png" }),
      new File(["not an image"], "bad.png", { type: "image/png" }),
      new File([new Uint8Array(FEEDBACK_LIMITS.fileBytes + 1)], "large.png", { type: "image/png" }),
      new File([png], "fake.jpg", { type: "image/jpeg" }),
      new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
      new File([png.subarray(0, 30)], "truncated.png", { type: "image/png" }),
    ]) await expect(normalizeFeedbackImage(file)).rejects.toThrow();
  });

  it("rejects excessive decoded pixels and animated images", async () => {
    const pixels = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizeFeedbackImage(new File([new Uint8Array(pixels)], "pixels.png", { type: "image/png" }))).rejects.toThrow("1600 万像素");
    const animated = await sharp(Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]), { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expect(normalizeFeedbackImage(new File([new Uint8Array(animated)], "animated.webp", { type: "image/webp" }))).rejects.toThrow();
  });

  it("enforces bytes without trusting Content-Length and cancels overflowing streams", async () => {
    let cancelled = false;
    const request = new Request("http://oj.local", {
      method: "POST", headers: { "content-length": "1" },
      body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(6)); }, cancel() { cancelled = true; } }),
      duplex: "half",
    } as RequestInit);
    await expect(readFeedbackBody(request, 10)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    await expect(readFeedbackBody(new Request("http://oj.local", { method: "POST", body: "12345" }), 4)).rejects.toMatchObject({ status: 413 });
    await expect(readFeedbackBody(new Request("http://oj.local", { method: "POST", headers: { "content-length": "20" } }), 10)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects malformed multipart, extra fields and missing or long text", async () => {
    await expect(readFeedbackSubmission(new Request("http://oj.local", { method: "POST", body: "hello" }))).rejects.toThrow();
    await expect(readFeedbackSubmission(new Request("http://oj.local", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=bad" }, body: "broken" }))).rejects.toThrow();
    for (const [title, content] of [[" ", "text"], ["x".repeat(101), "text"], ["title", ""], ["title", "x".repeat(5001)]]) {
      await expect(readFeedbackSubmission(formRequest([], title, content))).rejects.toThrow();
    }
    const body = new FormData();
    body.set("title", "title"); body.set("content", "content"); body.set("authorId", "2");
    await expect(readFeedbackSubmission(new Request("http://oj.local", { method: "POST", body }))).rejects.toThrow("字段");
    body.delete("authorId"); body.set("attachments", "fake");
    await expect(readFeedbackSubmission(new Request("http://oj.local", { method: "POST", body }))).rejects.toThrow();
    body.delete("attachments"); body.append("title", "duplicate");
    await expect(readFeedbackSubmission(new Request("http://oj.local", { method: "POST", body }))).rejects.toThrow("字段");
  });

  it("cancels stalled body reads after 30 seconds", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    try {
      const request = new Request("http://oj.local", { method: "POST", body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half" } as RequestInit);
      const result = expect(readFeedbackBody(request, 100)).rejects.toMatchObject({ status: 408 });
      await vi.advanceTimersByTimeAsync(30_000);
      await result;
      expect(cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates IDs and bounded JSON objects", async () => {
    for (const id of ["0", "-1", "1e2", "1.2", "abc", "9007199254740992"]) expect(() => feedbackId(id)).toThrow();
    expect(feedbackId("123")).toBe(123);
    expect(feedbackText(" x ", 1, "text")).toBe("x");
    for (const body of ["null", "[]", "true", "broken", '"string"']) {
      await expect(readFeedbackJson(new Request("http://oj.local", { method: "POST", body }))).rejects.toThrow();
    }
    expect(await readFeedbackJson(new Request("http://oj.local", { method: "POST", body: '{"status":"pending"}' }))).toEqual({ status: "pending" });
  });
});
