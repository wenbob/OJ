import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = await vi.hoisted(async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(path.join(tmpdir(), "oj-exam-lifecycle-"));
  const file = path.join(dir, "test.db");
  const db = new DatabaseSync(file);
  db.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
  db.close();
  return { dir, url: `file:${file.replaceAll("\\", "/")}` };
});
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: fixture.url } } }) };
});

import { prisma } from "@/lib/prisma";
import { createSessionToken, type CurrentUser } from "@/lib/auth";
import { calculateExamScore, refreshFinishedExamScore } from "@/lib/examScoring";
import { deleteUnusedDraftExam, endExam, getExamSubmissionActivity, setExamArchived, withExamSubmissionActivity } from "./examLifecycle";
import type { StaffUser } from "./staffAccess";
import { POST as archive, DELETE as restore } from "@/app/api/admin/exams/[id]/archive/route";
import { POST as start } from "@/app/api/exams/[id]/start/route";
import { GET as detail } from "@/app/api/exams/[id]/route";

let sequence = 0;
let teacher: StaffUser;
let otherTeacher: StaffUser;
let admin: StaffUser;
let student: CurrentUser;
let otherStudent: CurrentUser;
let problemId: number;
beforeEach(async () => {
  sequence++;
  const createUser = async (role: CurrentUser["role"], name: string) => {
    const row = await prisma.user.create({ data: { role, username: `${sequence}-${name}`, passwordHash: "fixture" } });
    return { id: row.id, username: row.username, role };
  };
  teacher = await createUser("teacher", "teacher") as StaffUser;
  otherTeacher = await createUser("teacher", "other-teacher") as StaffUser;
  admin = await createUser("admin", "admin") as StaffUser;
  student = await createUser("student", "student");
  otherStudent = await createUser("student", "other-student");
  const problem = await prisma.problem.create({ data: { title: "live title", description: "fixture", inputDescription: "", outputDescription: "", sampleInput: "", sampleOutput: "", difficulty: "basic", category: "test" } });
  problemId = problem.id;
});
afterAll(async () => {
  await prisma.$disconnect();
  const { rmSync } = await import("node:fs");
  rmSync(fixture.dir, { recursive: true, force: true });
});

async function createExam(status = "ended", recordStatus?: string) {
  return prisma.exam.create({ data: { title: "exam history", status, createdById: teacher.id, durationMin: 60,
    problems: { create: { problemId, score: 100, snapshotTitle: "original snapshot", snapshotProblemType: "programming", snapshotScore: 100, snapshotAt: new Date() } },
    ...(recordStatus ? { records: { create: { userId: student.id, status: recordStatus } } } : {}),
  } });
}
function request(user: CurrentUser, examId: number, suffix: string, method = "POST") {
  return new NextRequest(`http://oj.local/api/admin/exams/${examId}/${suffix}`, { method,
    headers: { origin: "http://oj.local", cookie: `oj_session=${createSessionToken({ ...user, sessionVersion: 0 })}` },
  });
}
const context = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("exam archive with real SQLite and role authentication", () => {
  it("preserves zero-submission records, settles ended records, and writes one audit per state change", async () => {
    const exam = await createExam("ended", "in_progress");
    expect((await archive(request(teacher, exam.id, "archive"), context(exam.id))).status).toBe(200);
    expect((await archive(request(teacher, exam.id, "archive"), context(exam.id))).status).toBe(200);
    expect(await prisma.examRecord.findUnique({ where: { examId_userId: { examId: exam.id, userId: student.id } } })).toMatchObject({ status: "expired", totalScore: 0 });
    expect(await prisma.examProblem.count({ where: { examId: exam.id } })).toBe(1);
    expect(await prisma.examArchiveAudit.count({ where: { examId: exam.id } })).toBe(1);
    expect((await restore(request(teacher, exam.id, "archive", "DELETE"), context(exam.id))).status).toBe(200);
    expect((await restore(request(teacher, exam.id, "archive", "DELETE"), context(exam.id))).status).toBe(200);
    expect(await prisma.exam.findUnique({ where: { id: exam.id } })).toMatchObject({ status: "ended", archivedAt: null });
    expect(await prisma.examArchiveAudit.count({ where: { examId: exam.id } })).toBe(2);
    await expect(deleteUnusedDraftExam(admin, exam.id)).rejects.toMatchObject({ status: 409 });
  });

  it("keeps teacher ownership and student history private, and rejects student mutations", async () => {
    const exam = await createExam("ended", "submitted");
    expect((await archive(request(otherTeacher, exam.id, "archive"), context(exam.id))).status).toBe(404);
    expect((await archive(request(student, exam.id, "archive"), context(exam.id))).status).toBe(403);
    expect((await archive(request(admin, exam.id, "archive"), context(exam.id))).status).toBe(200);
    expect((await detail(request(student, exam.id, "", "GET"), context(exam.id))).status).toBe(200);
    expect((await detail(request(otherStudent, exam.id, "", "GET"), context(exam.id))).status).toBe(404);
    expect((await start(request(student, exam.id, "start"), context(exam.id))).status).toBe(409);
    expect((await start(request(otherStudent, exam.id, "start"), context(exam.id))).status).toBe(403);
    expect(await prisma.examRecord.count({ where: { examId: exam.id } })).toBe(1);
  });

  it("waits for accepted work through persistence and score refresh without losing an on-time submission", async () => {
    const exam = await createExam("published", "in_progress");
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    let ready!: () => void;
    const registered = new Promise<void>((resolve) => { ready = resolve; });
    const receivedAt = new Date();
    const task = withExamSubmissionActivity(exam.id, async () => {
      ready();
      await gate;
      await prisma.submission.create({ data: { userId: student.id, problemId, examId: exam.id, submissionType: "exam", code: "kept code", language: "C++17", status: "Accepted", passedCount: 1, totalCount: 1, runtimeMs: 1, createdAt: receivedAt } });
      await refreshFinishedExamScore({ examId: exam.id, userId: student.id });
    });
    await registered;
    await endExam(teacher, exam.id);
    expect(getExamSubmissionActivity(exam.id)).toBe(1);
    expect((await archive(request(teacher, exam.id, "archive"), context(exam.id))).status).toBe(409);
    expect(await prisma.examArchiveAudit.count({ where: { examId: exam.id } })).toBe(0);
    finish();
    await task;
    expect(getExamSubmissionActivity(exam.id)).toBe(0);
    await setExamArchived(teacher, exam.id, true);
    expect((await calculateExamScore({ examId: exam.id, userId: student.id })).totalScore).toBe(100);
    expect(await prisma.examRecord.findUnique({ where: { examId_userId: { examId: exam.id, userId: student.id } } })).toMatchObject({ totalScore: 100 });
    expect(await prisma.submission.findFirst({ where: { examId: exam.id } })).toMatchObject({ code: "kept code", examId: exam.id, createdAt: receivedAt });
  });

  it("releases failed activities and permits deletion only of a draft with no history", async () => {
    const published = await createExam("published");
    await expect(setExamArchived(teacher, published.id, true)).rejects.toMatchObject({ status: 409 });
    await expect(withExamSubmissionActivity(published.id, async () => { throw new Error("judge unavailable"); })).rejects.toThrow("judge unavailable");
    expect(getExamSubmissionActivity(published.id)).toBe(0);
    const draft = await createExam("draft");
    await deleteUnusedDraftExam(teacher, draft.id);
    expect(await prisma.exam.findUnique({ where: { id: draft.id } })).toBeNull();
    const historyDraft = await createExam("draft", "submitted");
    await expect(deleteUnusedDraftExam(admin, historyDraft.id)).rejects.toMatchObject({ status: 409 });
    await expect(prisma.exam.delete({ where: { id: historyDraft.id } })).rejects.toThrow();
    expect(await prisma.examRecord.count({ where: { examId: historyDraft.id } })).toBe(1);
  });

  it("refreshes a finished record's stale cached score before archiving and preserves operator snapshots", async () => {
    const exam = await createExam("ended", "submitted");
    await prisma.examRecord.update({ where: { examId_userId: { examId: exam.id, userId: student.id } }, data: { totalScore: 0 } });
    await prisma.submission.create({ data: { examId: exam.id, userId: student.id, problemId, submissionType: "exam", code: "preserved", language: "C++17", status: "Accepted", passedCount: 1, totalCount: 1 } });
    await setExamArchived(teacher, exam.id, true);
    expect(await prisma.examRecord.findUnique({ where: { examId_userId: { examId: exam.id, userId: student.id } } })).toMatchObject({ totalScore: 100 });
    await prisma.user.delete({ where: { id: teacher.id } });
    expect(await prisma.examArchiveAudit.findFirst({ where: { examId: exam.id } })).toMatchObject({ operatorId: null, operatorUsername: teacher.username, operatorRole: "teacher" });
    expect(await prisma.exam.findUnique({ where: { id: exam.id } })).toMatchObject({ createdById: null, status: "ended" });
  });
});
