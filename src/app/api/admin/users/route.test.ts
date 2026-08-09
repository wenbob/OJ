import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH, PUT } from "./[id]/route";
import { POST as RESET_PASSWORD } from "./[id]/reset-password/route";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  getStudentRankings: vi.fn(),
  hashPassword: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    user: {
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock("@/lib/password", () => ({
  hashPassword: mocks.hashPassword,
  validateAccountPassword(password: string) {
    if (password.length < 8) return "密码至少需要 8 位";
    return null;
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/ranking", () => ({
  getStudentRankings: mocks.getStudentRankings,
  normalizeCustomTitle(value: unknown) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  },
  validateCustomTitle(value: string | null) {
    if (value && value.length > 20) {
      return "自定义头衔不能超过 20 个字符";
    }
    return null;
  },
}));

function jsonRequest(body: unknown) {
  return new Request("http://local.test/api/admin/users", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }) as NextRequest;
}

function emptyRequest() {
  return new Request("http://local.test/api/admin/users") as NextRequest;
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createTx() {
  return {
    exam: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    studentProfile: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    user: {
      count: vi.fn().mockResolvedValue(2),
      delete: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ role: "student" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        createdAt: new Date("2026-06-28T00:00:00.000Z"),
        id: 2,
        role: "student",
        studentProfile: {
          aiAccessEnabled: false,
          customTitle: "算法新星",
        },
        username: "alice",
      }),
      update: vi.fn().mockResolvedValue({
        createdAt: new Date("2026-06-28T00:00:00.000Z"),
        id: 2,
        role: "student",
        username: "alice",
      }),
    },
  };
}

describe("admin users API custom title handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.prisma.user.delete.mockResolvedValue({});
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(async (callback) =>
      callback(createTx()),
    );
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
  });

  it("returns custom title and ranking summary in the user list", async () => {
    const ranking = {
      acceptedSubmissionCount: 3,
      acCount: 2,
      customTitle: "算法新星",
      displayTitle: "算法新星",
      points: 20,
      rank: 1,
      tierTitle: "青铜学徒",
      userId: 2,
      username: "alice",
    };
    mocks.prisma.user.findMany.mockResolvedValue([
      {
        _count: { submissions: 4 },
        createdAt: new Date("2026-06-28T00:00:00.000Z"),
        id: 2,
        role: "student",
        studentProfile: {
          aiAccessEnabled: true,
          customTitle: "算法新星",
        },
        username: "alice",
      },
    ]);
    mocks.getStudentRankings.mockResolvedValue([ranking]);

    const response = await GET(emptyRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.users[0]).toMatchObject({
      aiAccessEnabled: true,
      customTitle: "算法新星",
      ranking,
      username: "alice",
    });
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          passwordHash: expect.anything(),
        }),
      }),
    );
  });

  it("creates a student with a custom title", async () => {
    mocks.prisma.user.create.mockResolvedValue({
      createdAt: new Date("2026-06-28T00:00:00.000Z"),
      id: 2,
      role: "student",
      studentProfile: {
        aiAccessEnabled: false,
        customTitle: "算法新星",
      },
      username: "alice",
    });

    const response = await POST(
      jsonRequest({
        customTitle: "  算法新星  ",
        password: "secret123",
        role: "student",
        username: "alice",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "student",
          studentProfile: {
            create: {
              aiAccessEnabled: false,
              customTitle: "算法新星",
              objectiveAiAccessEnabled: false,
            },
          },
          username: "alice",
        }),
      }),
    );
  });

  it("creates a student profile for AI access without a custom title", async () => {
    mocks.prisma.user.create.mockResolvedValue({
      createdAt: new Date("2026-06-28T00:00:00.000Z"),
      id: 2,
      role: "student",
      studentProfile: { aiAccessEnabled: true, customTitle: null },
      username: "alice",
    });

    const response = await POST(
      jsonRequest({
        aiAccessEnabled: true,
        customTitle: "",
        password: "secret123",
        role: "student",
        username: "alice",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentProfile: {
            create: {
              aiAccessEnabled: true,
              customTitle: null,
              objectiveAiAccessEnabled: false,
            },
          },
        }),
      }),
    );
  });

  it("rejects custom titles longer than 20 characters", async () => {
    const response = await POST(
      jsonRequest({
        customTitle: "一二三四五六七八九十一二三四五六七八九十一",
        password: "secret123",
        role: "student",
        username: "alice",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("自定义头衔不能超过 20 个字符");
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("updates a student custom title", async () => {
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PUT(
      jsonRequest({
        customTitle: "算法新星",
        password: "",
        role: "student",
        username: "alice",
      }),
      routeContext("2"),
    );

    expect(response.status).toBe(200);
    expect(tx.studentProfile.upsert).toHaveBeenCalledWith({
      create: {
        aiAccessEnabled: false,
        customTitle: "算法新星",
        objectiveAiAccessEnabled: false,
        userId: 2,
      },
      update: {
        aiAccessEnabled: false,
        customTitle: "算法新星",
        objectiveAiAccessEnabled: false,
      },
      where: { userId: 2 },
    });
  });

  it("keeps a student profile when AI access is enabled without a custom title", async () => {
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PUT(
      jsonRequest({
        aiAccessEnabled: true,
        customTitle: "",
        password: "",
        role: "student",
        username: "alice",
      }),
      routeContext("2"),
    );

    expect(response.status).toBe(200);
    expect(tx.studentProfile.upsert).toHaveBeenCalledWith({
      create: {
        aiAccessEnabled: true,
        customTitle: null,
        objectiveAiAccessEnabled: false,
        userId: 2,
      },
      update: {
        aiAccessEnabled: true,
        customTitle: null,
        objectiveAiAccessEnabled: false,
      },
      where: { userId: 2 },
    });
    expect(tx.studentProfile.deleteMany).not.toHaveBeenCalled();
  });

  it("clears a student custom title when the submitted title is empty", async () => {
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PUT(
      jsonRequest({
        customTitle: "   ",
        password: "",
        role: "student",
        username: "alice",
      }),
      routeContext("2"),
    );

    expect(response.status).toBe(200);
    expect(tx.studentProfile.deleteMany).toHaveBeenCalledWith({
      where: { userId: 2 },
    });
    expect(tx.studentProfile.upsert).not.toHaveBeenCalled();
  });

  it("allows administrators to create teacher accounts", async () => {
    mocks.prisma.user.create.mockResolvedValue({
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
      id: 4,
      role: "teacher",
      studentProfile: null,
      username: "coach",
    });

    const response = await POST(
      jsonRequest({
        password: "secret123",
        role: "teacher",
        username: "coach",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "teacher",
          username: "coach",
        }),
      }),
    );
  });

  it("shows teachers only student accounts", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    mocks.prisma.user.findMany.mockResolvedValue([]);
    mocks.getStudentRankings.mockResolvedValue([]);

    const response = await GET(emptyRequest());

    expect(response.status).toBe(200);
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: "student" },
      }),
    );
  });

  it("creates teacher-managed students with the fixed password and AI enabled by default", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    mocks.prisma.user.create.mockResolvedValue({
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
      id: 5,
      role: "student",
      studentProfile: { aiAccessEnabled: true, customTitle: null },
      username: "bob",
    });

    const response = await POST(
      jsonRequest({
        username: "bob",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.hashPassword).toHaveBeenCalledWith("12345678");
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "hashed-password",
          role: "student",
          studentProfile: {
            create: {
              aiAccessEnabled: true,
              customTitle: null,
              objectiveAiAccessEnabled: false,
            },
          },
          username: "bob",
        }),
      }),
    );
  });

  it("lets teachers disable AI while creating a student", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    mocks.prisma.user.create.mockResolvedValue({
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
      id: 5,
      role: "student",
      studentProfile: null,
      username: "bob",
    });

    const response = await POST(
      jsonRequest({
        aiAccessEnabled: false,
        username: "bob",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          studentProfile: expect.anything(),
        }),
      }),
    );
  });

  it.each(["password", "role", "customTitle"])(
    "rejects the teacher-only forbidden create field %s",
    async (field) => {
      mocks.requireApiUser.mockResolvedValueOnce({
        response: null,
        user: { id: 4, role: "teacher", username: "coach" },
      });

      const response = await POST(
        jsonRequest({
          [field]: field === "role" ? "teacher" : "forbidden",
          username: "bob",
        }),
      );

      expect(response.status).toBe(403);
      expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    },
  );

  it("revokes existing sessions when the password changes", async () => {
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PUT(
      jsonRequest({
        customTitle: "",
        password: "new-secret-123",
        role: "student",
        username: "alice",
      }),
      routeContext("2"),
    );

    expect(response.status).toBe(200);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "hashed-password",
          sessionVersion: { increment: 1 },
        }),
      }),
    );
  });

  it("revokes sessions when changing a student into an administrator", async () => {
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PUT(
      jsonRequest({
        customTitle: "",
        password: "",
        role: "admin",
        username: "alice",
      }),
      routeContext("2"),
    );

    expect(response.status).toBe(200);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "admin",
          sessionVersion: { increment: 1 },
        }),
      }),
    );
    expect(tx.studentProfile.deleteMany).toHaveBeenCalledWith({
      where: { userId: 2 },
    });
  });

  it("clears exam ownership and revokes sessions when demoting a teacher", async () => {
    const tx = createTx();
    tx.user.findUnique.mockResolvedValueOnce({ role: "teacher" });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PUT(
      jsonRequest({
        customTitle: "",
        password: "",
        role: "student",
        username: "former-coach",
      }),
      routeContext("4"),
    );

    expect(response.status).toBe(200);
    expect(tx.exam.updateMany).toHaveBeenCalledWith({
      data: { createdById: null },
      where: { createdById: 4 },
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "student",
          sessionVersion: { increment: 1 },
        }),
      }),
    );
  });

  it("rejects teacher access to the full user edit endpoint", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PUT(
      jsonRequest({
        customTitle: "老师不能修改",
        password: "another-password",
        role: "student",
        username: "alice-renamed",
      }),
      routeContext("2"),
    );

    expect(response.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("lets a teacher change only a student's AI access without overwriting the title", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PATCH(
      jsonRequest({ aiAccessEnabled: true }),
      routeContext("2"),
    );

    expect(response.status).toBe(200);
    expect(tx.studentProfile.upsert).toHaveBeenCalledWith({
      create: {
        aiAccessEnabled: true,
        customTitle: null,
        objectiveAiAccessEnabled: false,
        userId: 2,
      },
      update: { aiAccessEnabled: true },
      where: { userId: 2 },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects extra fields in a teacher AI access request", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });

    const response = await PATCH(
      jsonRequest({
        aiAccessEnabled: true,
        customTitle: "不能修改",
      }),
      routeContext("2"),
    );

    expect(response.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects teacher AI changes for a non-student account", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    const tx = createTx();
    tx.user.findUnique.mockResolvedValueOnce({ role: "teacher" });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PATCH(
      jsonRequest({ aiAccessEnabled: true }),
      routeContext("5"),
    );

    expect(response.status).toBe(403);
    expect(tx.studentProfile.upsert).not.toHaveBeenCalled();
  });

  it("rejects teacher attempts to delete students", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });

    const response = await DELETE(emptyRequest(), routeContext("2"));

    expect(response.status).toBe(403);
    expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
  });

  it("keeps administrator user deletion available", async () => {
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await DELETE(emptyRequest(), routeContext("2"));

    expect(response.status).toBe(200);
    expect(tx.user.delete).toHaveBeenCalledWith({
      where: { id: 2 },
    });
  });

  it("rejects demoting the last administrator", async () => {
    const tx = createTx();
    tx.user.findUnique.mockResolvedValueOnce({ role: "admin" });
    tx.user.count.mockResolvedValueOnce(1);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await PUT(
      jsonRequest({
        customTitle: "",
        password: "",
        role: "teacher",
        username: "root",
      }),
      routeContext("2"),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("至少保留一个管理员");
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects deleting the last administrator", async () => {
    const tx = createTx();
    tx.user.findUnique.mockResolvedValueOnce({ role: "admin" });
    tx.user.count.mockResolvedValueOnce(1);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await DELETE(emptyRequest(), routeContext("2"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("至少保留一个管理员");
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("maps the database last-admin trigger to a stable conflict response", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(
      new Error("constraint failed: LAST_ADMIN_REQUIRED"),
    );

    const response = await DELETE(emptyRequest(), routeContext("2"));

    expect(response.status).toBe(409);
  });

  it("resets a student password to the fixed value and revokes sessions", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    const response = await RESET_PASSWORD(emptyRequest(), routeContext("2"));

    expect(response.status).toBe(200);
    expect(mocks.hashPassword).toHaveBeenCalledWith("12345678");
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      data: {
        passwordHash: "hashed-password",
        sessionVersion: { increment: 1 },
      },
      where: { id: 2, role: "student" },
    });
  });

  it("does not reset a non-student account", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    mocks.prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });

    const response = await RESET_PASSWORD(emptyRequest(), routeContext("5"));

    expect(response.status).toBe(404);
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      data: {
        passwordHash: "hashed-password",
        sessionVersion: { increment: 1 },
      },
      where: { id: 5, role: "student" },
    });
  });

  it("blocks non-admin callers before mutating data", async () => {
    mocks.requireApiUser.mockResolvedValue({
      response: NextResponse.json({ error: "权限不足" }, { status: 403 }),
      user: null,
    });

    const response = await POST(
      jsonRequest({
        customTitle: "算法新星",
        password: "secret123",
        role: "student",
        username: "alice",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects weak passwords when creating users", async () => {
    const response = await POST(
      jsonRequest({
        customTitle: "",
        password: "short",
        role: "student",
        username: "alice",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("密码至少需要 8 位");
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });
});
