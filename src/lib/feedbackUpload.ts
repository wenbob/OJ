import sharp from "sharp";
import { FeedbackError, feedbackText } from "@/lib/feedbackErrors";
import { FEEDBACK_IMAGE_TYPES, FEEDBACK_LIMITS } from "@/lib/feedbackShared";

// Enforce actual bytes before multipart/JSON parsing, including chunked uploads.
export async function readFeedbackBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes) {
    throw new FeedbackError("请求内容过大", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new FeedbackError("请求内容不能为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 30_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new FeedbackError("上传超时，请稍后重试", 408);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new FeedbackError("请求内容过大", 413);
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

function isAnimatedPng(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  // libvips may decode only the first frame of APNG; inspect the actual chunks.
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) break;
    if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    offset += length + 12;
  }
  return false;
}

export async function readFeedbackJson(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readFeedbackBody(request, 32 * 1024);
  try {
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new FeedbackError("请求格式不正确");
  }
}

export async function normalizeFeedbackImage(file: File) {
  if (!FEEDBACK_IMAGE_TYPES.includes(file.type) || !file.size || file.size > FEEDBACK_LIMITS.fileBytes) {
    throw new FeedbackError("截图须为 PNG、JPEG 或 WebP，单张不超过 5 MiB");
  }
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (isAnimatedPng(bytes)) throw new Error("Animated PNG is not supported");
    const image = sharp(bytes, { limitInputPixels: FEEDBACK_LIMITS.imagePixels, failOn: "warning" });
    const metadata = await image.metadata();
    const expectedMime = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
    if (!FEEDBACK_IMAGE_TYPES.includes(expectedMime) || expectedMime !== file.type || (metadata.pages ?? 1) > 1) {
      throw new Error("Unsupported image");
    }
    const result = await image.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    if (result.data.byteLength > FEEDBACK_LIMITS.storedImageBytes) {
      throw new FeedbackError("截图压缩后仍超过 1 MiB，请裁剪后重试");
    }
    return {
      data: new Uint8Array(result.data),
      mimeType: "image/webp",
      width: result.info.width,
      height: result.info.height,
      byteSize: result.data.byteLength,
    };
  } catch (error) {
    if (error instanceof FeedbackError) throw error;
    throw new FeedbackError("截图无法读取：请使用完整的静态 PNG、JPEG 或 WebP，且不超过 1600 万像素");
  }
}

export async function readFeedbackSubmission(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new FeedbackError("请使用反馈表单提交");
  }
  const body = await readFeedbackBody(request, FEEDBACK_LIMITS.requestBytes);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new FeedbackError("反馈表单格式不正确");
  }
  if (Array.from(form.keys()).some((key) => !["title", "content", "attachments"].includes(key)) ||
      form.getAll("title").length !== 1 || form.getAll("content").length !== 1) {
    throw new FeedbackError("反馈表单字段不正确");
  }
  const title = feedbackText(form.get("title"), FEEDBACK_LIMITS.title, "标题");
  const content = feedbackText(form.get("content"), FEEDBACK_LIMITS.content, "问题描述");
  const files = form.getAll("attachments");
  if (files.length > FEEDBACK_LIMITS.attachments || files.some((file) => typeof file === "string")) {
    throw new FeedbackError("每条反馈最多上传 3 张截图");
  }
  const attachments = [];
  // Sequential conversion keeps peak memory bounded on the 2 GB server.
  for (const [position, file] of files.entries()) {
    attachments.push({ ...await normalizeFeedbackImage(file as File), position });
  }
  return { title, content, attachments };
}
