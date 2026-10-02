import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import { getLadderSettings, saveLadderSettings } from "@/lib/ladderSettings";
import { applyPointAdjustment, getLadderStudentPage, getPointAdjustmentPage } from "@/lib/ladder";
import { LadderError } from "@/lib/ladderTransaction";
import { DEFAULT_RANK_TIERS } from "@/lib/ladderShared";
import { GET as getSettings, PUT as putSettings } from "./settings/route";
import { GET as getStudents } from "./students/route";
import { GET as getAdjustments } from "./adjustments/route";
import { POST as adjust } from "./students/[id]/adjustments/route";

vi.mock("@/lib/auth", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/ladderSettings", () => ({ getLadderSettings: vi.fn(), saveLadderSettings: vi.fn() }));
vi.mock("@/lib/ladder", () => ({ applyPointAdjustment: vi.fn(), getLadderStudentPage: vi.fn(), getPointAdjustmentPage: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
function request(path: string, method = "GET", body?: unknown, contentLength?: number) {
  return new Request(`http://oj.local/api/admin/ladder/${path}`, { method, headers: { "Content-Type": "application/json", ...(contentLength ? { "Content-Length": String(contentLength) } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }) as never;
}
const pointInput = () => ({ mode: "add", inputPoints: 10, expectedPoints: 0, reason: "reason-private", requestId: randomUUID() });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiUser).mockResolvedValue({ user: { id: 9, username: "admin", role: "admin" }, response: null });
  vi.mocked(getLadderSettings).mockResolvedValue({ revision: "rev-1", tiers: [...DEFAULT_RANK_TIERS] });
  vi.mocked(saveLadderSettings).mockResolvedValue({ revision: "rev-2", tiers: [...DEFAULT_RANK_TIERS] });
  vi.mocked(getLadderStudentPage).mockResolvedValue({ students: [], tiers: DEFAULT_RANK_TIERS, total: 0, page: 1, pageSize: 20, totalPages: 1, query: "" });
  vi.mocked(getPointAdjustmentPage).mockResolvedValue({ records: [], mode: "", total: 0, page: 1, pageSize: 20, totalPages: 1, query: "" });
  vi.mocked(applyPointAdjustment).mockResolvedValue({ adjustment: null, ranking: { userId: 2, username: "student", points: 0, basePoints: 0, rewardPoints: 0, acCount: 0, acceptedSubmissionCount: 0, customTitle: null, displayTitle: "青铜学徒", tierTitle: "青铜学徒" }, replayed: false, changed: false });
});

describe("admin-only ladder API", () => {
  it("authenticates every read and write as admin before invoking services", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ user: null, response: NextResponse.json({ error: "权限不足" }, { status: 403 }) });
    const responses = await Promise.all([
      getSettings(request("settings")), putSettings(request("settings", "PUT", {})),
      getStudents(request("students")), getAdjustments(request("adjustments")),
      adjust(request("students/1/adjustments", "POST", pointInput()), { params: Promise.resolve({ id: "1" }) }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
    for (const call of vi.mocked(requireApiUser).mock.calls) expect(call[1]).toBe("admin");
    expect(applyPointAdjustment).not.toHaveBeenCalled(); expect(getPointAdjustmentPage).not.toHaveBeenCalled(); expect(saveLadderSettings).not.toHaveBeenCalled();
  });
  it("returns private uncached responses and propagates server pagination/search", async () => {
    const response = await getStudents(request("students?page=2&pageSize=1000&q=alice"));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getLadderStudentPage).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 100, query: "alice" }));
    const records = await getAdjustments(request("adjustments?mode=set&studentId=2&q=bob"));
    expect(records.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getPointAdjustmentPage).toHaveBeenCalledWith(expect.objectContaining({ mode: "set", studentId: 2, query: "bob" }));
  });
  it("refuses stale or absent configuration revisions and invalid thresholds", async () => {
    const values = DEFAULT_RANK_TIERS.map((tier) => tier.minPoints);
    expect((await putSettings(request("settings", "PUT", { minPoints: values }))).status).toBe(409);
    expect((await putSettings(request("settings", "PUT", { revision: "rev-1", minPoints: [0, 1, 1, 3, 4, 5, 6, 7] }))).status).toBe(400);
    vi.mocked(saveLadderSettings).mockRejectedValueOnce(new LadderError("门槛已更新", 409));
    expect((await putSettings(request("settings", "PUT", { revision: "rev-1", minPoints: values }))).status).toBe(409);
  });
  it("saves the full valid thresholds and passes the revision to the service", async () => {
    const minPoints = DEFAULT_RANK_TIERS.map((tier) => tier.minPoints);
    const response = await putSettings(request("settings", "PUT", { revision: "rev-1", minPoints }));
    expect(response.status).toBe(200); expect(saveLadderSettings).toHaveBeenCalledWith("rev-1", minPoints);
    expect(await response.json()).toMatchObject({ revision: "rev-2" });
  });
  it("takes the actor from auth and rejects injected actor fields and blank reasons", async () => {
    const body = pointInput();
    expect((await adjust(request("students/2/adjustments", "POST", { ...body, administratorId: 3 }), { params: Promise.resolve({ id: "2" }) })).status).toBe(400);
    expect((await adjust(request("students/2/adjustments", "POST", { ...body, reason: "  " }), { params: Promise.resolve({ id: "2" }) })).status).toBe(400);
    const response = await adjust(request("students/2/adjustments", "POST", body), { params: Promise.resolve({ id: "2" }) });
    expect(response.status).toBe(200); expect(applyPointAdjustment).toHaveBeenCalledWith(2, 9, body);
  });
  it("returns the latest points for an admin conflict without executing a second write", async () => {
    vi.mocked(applyPointAdjustment).mockRejectedValue(new LadderError("积分已变化", 409, 30));
    const response = await adjust(request("students/2/adjustments", "POST", pointInput()), { params: Promise.resolve({ id: "2" }) });
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "积分已变化", currentPoints: 30 });
  });
  it("rejects oversized adjustment and settings payloads", async () => {
    const point = await adjust(request("students/2/adjustments", "POST", pointInput(), 65537), { params: Promise.resolve({ id: "2" }) });
    const settings = await putSettings(request("settings", "PUT", {}, 65537));
    expect(point.status).toBe(413); expect(settings.status).toBe(413); expect(applyPointAdjustment).not.toHaveBeenCalled();
  });
  it("does not expose private errors or reasons in failures", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(applyPointAdjustment).mockRejectedValue(new Error("secret-reason-snapshot"));
    const response = await adjust(request("students/2/adjustments", "POST", pointInput()), { params: Promise.resolve({ id: "2" }) });
    expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("secret-reason-snapshot");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("secret-reason-snapshot"); logger.mockRestore();
  });
  it("validates target IDs, history filters and retry hints", async () => {
    expect((await adjust(request("students/abc/adjustments", "POST", pointInput()), { params: Promise.resolve({ id: "abc" }) })).status).toBe(404);
    expect((await getAdjustments(request("adjustments?mode=delete"))).status).toBe(400);
    expect((await getAdjustments(request("adjustments?studentId=-1"))).status).toBe(400);
    vi.mocked(getLadderSettings).mockRejectedValue(new LadderError("操作繁忙", 503));
    const response = await getSettings(request("settings")); expect(response.status).toBe(503); expect(response.headers.get("Retry-After")).toBe("2");
  });
});
