import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "./auth";
import { AnnouncementError, announcementDetail, listAnnouncements, pendingAnnouncement, publishAnnouncement, readAnnouncement, withdrawAnnouncement } from "./announcements";

type Action = "list" | "pending" | "detail" | "read" | "adminList" | "publish" | "withdraw";
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new AnnouncementError("请求内容不能为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32 * 1024) throw new AnnouncementError("请求内容过大", 413);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AnnouncementError("请求格式不正确"); }
}

export async function announcementApi(request: NextRequest, action: Action, rawId?: string) {
  const admin = ["adminList", "publish", "withdraw"].includes(action);
  const auth = await requireApiUser(request, admin ? "admin" : ["student", "teacher"]);
  if (auth.response) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  try {
    const id = Number(rawId);
    if (rawId !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new AnnouncementError("公告不存在", 404);
    if (action === "publish") {
      const row = await publishAnnouncement(auth.user.id, await readBody(request));
      return json({ id: row.id });
    }
    if (action === "read") return json(await readAnnouncement(auth.user.id, id));
    if (action === "withdraw") return json(await withdrawAnnouncement(auth.user.id, id));
    if (action === "detail") return json(await announcementDetail(auth.user.id, id));
    if (action === "pending") return json(await pendingAnnouncement(auth.user.id, auth.user.role === "student"));
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page <= 0) throw new AnnouncementError("页码不正确");
    return json(await listAnnouncements(auth.user.id, admin, page));
  } catch (error) {
    if (error instanceof AnnouncementError) return json({ error: error.message }, error.status);
    console.error("[ANNOUNCEMENT_REQUEST_FAILED]", { userId: auth.user.id, action });
    return json({ error: "公告操作暂时失败，请重试" }, 503);
  }
}
