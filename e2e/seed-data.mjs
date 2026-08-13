import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const prismaDirectory = path.join(repositoryRoot, "prisma");
export const e2eDatabasePath = path.join(prismaDirectory, "e2e.db");
export const e2eDatabaseUrl = `file:${e2eDatabasePath.replaceAll("\\", "/")}`;

function assertE2eDatabasePath() {
  if (
    path.dirname(e2eDatabasePath) !== prismaDirectory ||
    path.basename(e2eDatabasePath) !== "e2e.db"
  ) {
    throw new Error(
      "E2E database path escaped the repository prisma directory",
    );
  }
}

export async function prepareE2eDatabase() {
  assertE2eDatabasePath();
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    await rm(`${e2eDatabasePath}${suffix}`, { force: true });
  }

  const prismaCli = path.join(
    repositoryRoot,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  const initialize = spawnSync(
    process.execPath,
    [
      prismaCli,
      "db",
      "execute",
      "--file",
      path.join(prismaDirectory, "init.sql"),
      "--url",
      e2eDatabaseUrl,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: e2eDatabaseUrl },
    },
  );
  if (initialize.status !== 0) {
    throw new Error(
      `Unable to initialize the E2E database: ${initialize.stderr || initialize.stdout}`,
    );
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: e2eDatabaseUrl } },
  });
  try {
    const settings = [
      { key: "siteName", value: "OJ E2E" },
      { key: "siteSubtitle", value: "隔离浏览器回归环境" },
      { key: "icpRecordNumber", value: "陕ICP备2026021441号-1" },
      { key: "publicSecurityRecordNumber", value: "" },
      { key: "publicSecurityRecordIcon", value: "" },
      { key: "allowStudentRegister", value: "false" },
      { key: "aiPracticeEnabled", value: "true" },
      { key: "aiObjectiveExplanationEnabled", value: "true" },
      { key: "aiStudentObjectiveExplanationEnabled", value: "true" },
      { key: "aiConversationRetentionDays", value: "180" },
    ];
    await prisma.$transaction(
      settings.map((setting) =>
        prisma.systemSetting.upsert({
          create: setting,
          update: { value: setting.value },
          where: { key: setting.key },
        }),
      ),
    );

    await prisma.user.create({
      data: {
        id: 1,
        passwordHash: await hash("e2e-admin-password", 10),
        role: "admin",
        username: "e2e-admin",
      },
    });
    await prisma.user.create({
      data: {
        id: 2,
        passwordHash: await hash("e2e-student-password", 10),
        role: "student",
        studentProfile: {
          create: {
            aiAccessEnabled: true,
            objectiveAiAccessEnabled: true,
          },
        },
        username: "e2e-student",
      },
    });
    await prisma.user.create({
      data: {
        id: 3,
        passwordHash: await hash("e2e-teacher-password", 10),
        role: "teacher",
        username: "e2e-teacher",
      },
    });

    await prisma.problem.create({
      data: {
        category: "E2E",
        dataRange: "-1000 <= a,b <= 1000",
        description: "输入两个整数并输出它们的和。",
        difficulty: "入门",
        id: 101,
        inputDescription: "两个整数。",
        outputDescription: "它们的和。",
        problemType: "programming",
        sampleInput: "1 2",
        sampleOutput: "3",
        sortOrder: 1,
        testCases: {
          create: [
            { input: "1 2\n", isSample: true, output: "3\n" },
            { input: "3 4\n", isSample: true, output: "7\n" },
            {
              input: "HIDDEN_INPUT_E2E\n",
              isSample: false,
              output: "HIDDEN_EXPECTED_E2E\n",
            },
          ],
        },
        title: "E2E 加法题",
      },
    });
    await prisma.problem.create({
      data: {
        category: "E2E",
        dataRange: null,
        description: "判断数据是否存储在内存中。",
        difficulty: "入门",
        id: 105,
        inputDescription: "",
        objectiveItems: JSON.stringify([
          {
            answer: "True",
            kind: "judge",
            options: [],
            score: 1,
            stem: "变量可以保存在内存中。",
          },
        ]),
        outputDescription: "",
        problemType: "objective",
        sampleInput: "",
        sampleOutput: "",
        sortOrder: 4,
        title: "E2E 判断题",
      },
    });
    await prisma.problem.create({
      data: {
        category: "E2E",
        dataRange: "1 <= n <= 1000",
        description: "输入一个整数并输出它的两倍。",
        difficulty: "入门",
        id: 104,
        inputDescription: "一个整数。",
        outputDescription: "该整数的两倍。",
        problemType: "programming",
        sampleInput: "4",
        sampleOutput: "8",
        sortOrder: 3,
        testCases: {
          create: [{ input: "4\n", isSample: true, output: "8\n" }],
        },
        title: "E2E 双倍题",
      },
    });
    await prisma.problem.create({
      data: {
        category: "E2E",
        dataRange: "1 <= n <= 1000",
        description: "输入一个整数并原样输出。",
        difficulty: "入门",
        id: 102,
        inputDescription: "一个整数。",
        outputDescription: "原样输出该整数。",
        problemType: "programming",
        sampleInput: "7",
        sampleOutput: "7",
        sortOrder: 0,
        testCases: {
          create: [{ input: "7\n", isSample: true, output: "7\n" }],
        },
        title: "E2E 题单外编程题",
      },
    });
    await prisma.problem.create({
      data: {
        category: "E2E",
        dataRange: null,
        description: "选择负责保存数据的部件。",
        difficulty: "入门",
        id: 103,
        inputDescription: "",
        objectiveItems: JSON.stringify([
          {
            answer: "B",
            kind: "choice",
            options: [
              { label: "A", text: "处理器" },
              { label: "B", text: "存储器" },
            ],
            score: 1,
            stem: "哪个部件负责保存数据？",
          },
        ]),
        outputDescription: "",
        problemType: "objective",
        sampleInput: "",
        sampleOutput: "",
        sortOrder: 2,
        title: "E2E 客观题",
      },
    });

    await prisma.submission.create({
      data: {
        caseResults: {
          create: [
            {
              actualOutput: "HIDDEN_ACTUAL_E2E",
              caseIndex: 1,
              errorMessage: "HIDDEN_STDERR_E2E",
              expectedOutput: "HIDDEN_EXPECTED_E2E",
              input: "HIDDEN_INPUT_E2E",
              status: "Wrong Answer",
            },
          ],
        },
        code: "int main() { return 0; }",
        errorMessage: "HIDDEN_STDERR_E2E",
        id: 501,
        language: "C++17",
        passedCount: 0,
        problemId: 101,
        status: "Wrong Answer",
        submissionType: "practice",
        totalCount: 1,
        userId: 2,
      },
    });
    await prisma.submission.create({
      data: {
        caseResults: {
          create: [
            {
              actualOutput: "A",
              caseIndex: 1,
              expectedOutput: "B",
              input: "",
              status: "Wrong Answer",
            },
          ],
        },
        code: "A",
        id: 502,
        language: "Objective",
        problemId: 103,
        status: "Wrong Answer",
        submissionType: "practice",
        totalCount: 1,
        userId: 2,
      },
    });
    await prisma.submission.create({
      data: {
        caseResults: {
          create: [
            {
              actualOutput: "B",
              caseIndex: 1,
              expectedOutput: "B",
              input: "",
              status: "Accepted",
            },
          ],
        },
        code: "B",
        id: 503,
        language: "Objective",
        passedCount: 1,
        problemId: 103,
        status: "Accepted",
        submissionType: "practice",
        totalCount: 1,
        userId: 2,
      },
    });

    for (const examId of [201, 202, 203, 204]) {
      await prisma.exam.create({
        data: {
          aiEnabled: false,
          createdById: 1,
          description: "浏览器回归专用考试。",
          durationMin: 60,
          examType: "programming",
          id: examId,
          problems: {
            create: {
              order: 1,
              problemId: 101,
              score: 100,
              snapshotAt: new Date(),
              snapshotProblemType: "programming",
              snapshotScore: 100,
              snapshotTitle: "E2E 加法题",
            },
          },
          status: "published",
          title: `E2E 考试 ${examId}`,
        },
      });
    }
    await prisma.exam.create({
      data: {
        aiEnabled: false,
        createdById: 1,
        description: "浏览器多题布局回归专用考试。",
        durationMin: 60,
        examType: "programming",
        id: 205,
        problems: {
          create: [
            {
              order: 1,
              problemId: 101,
              score: 50,
              snapshotAt: new Date(),
              snapshotProblemType: "programming",
              snapshotScore: 50,
              snapshotTitle: "E2E 加法题",
            },
            {
              order: 2,
              problemId: 104,
              score: 50,
              snapshotAt: new Date(),
              snapshotProblemType: "programming",
              snapshotScore: 50,
              snapshotTitle: "E2E 双倍题",
            },
          ],
        },
        status: "published",
        title: "E2E 多题考试",
      },
    });
    await prisma.exam.create({
      data: {
        aiEnabled: false,
        createdById: 1,
        description: "浏览器客观题布局回归专用考试。",
        durationMin: 60,
        examType: "objective",
        id: 206,
        problems: {
          create: [
            {
              order: 1,
              problemId: 103,
              score: 1,
              snapshotAt: new Date(),
              snapshotObjectiveItems: JSON.stringify([
                {
                  answer: "B",
                  kind: "choice",
                  options: [
                    { label: "A", text: "处理器" },
                    { label: "B", text: "存储器" },
                  ],
                  score: 1,
                  stem: "哪个部件负责保存数据？",
                },
              ]),
              snapshotProblemType: "objective",
              snapshotScore: 1,
              snapshotTitle: "E2E 客观题",
            },
            {
              order: 2,
              problemId: 105,
              score: 1,
              snapshotAt: new Date(),
              snapshotObjectiveItems: JSON.stringify([
                {
                  answer: "True",
                  kind: "judge",
                  options: [],
                  score: 1,
                  stem: "变量可以保存在内存中。",
                },
              ]),
              snapshotProblemType: "objective",
              snapshotScore: 1,
              snapshotTitle: "E2E 判断题",
            },
          ],
        },
        status: "published",
        title: "E2E 客观多题考试",
      },
    });
    await prisma.submission.createMany({
      data: [
        {
          code: "// accepted before",
          examId: 205,
          id: 504,
          language: "C++17",
          passedCount: 1,
          problemId: 104,
          status: "Accepted",
          submissionType: "exam",
          totalCount: 1,
          userId: 2,
        },
        {
          code: "// later wrong answer",
          examId: 205,
          id: 505,
          language: "C++17",
          passedCount: 0,
          problemId: 104,
          status: "Wrong Answer",
          submissionType: "exam",
          totalCount: 1,
          userId: 2,
        },
      ],
    });
    await prisma.submission.create({
      data: {
        code: "A",
        examId: 206,
        id: 506,
        language: "Objective",
        passedCount: 0,
        problemId: 103,
        status: "Wrong Answer",
        submissionType: "exam",
        totalCount: 1,
        userId: 2,
      },
    });

    await prisma.aiConversation.create({
      data: {
        clientConversationId: "conversation_e2e_seed",
        examId: null,
        id: 401,
        problemId: 101,
        problemTitle: "E2E 加法题",
        scope: "practice",
        studentId: 2,
        turns: {
          create: {
            aiProfile: "programming",
            assistantContent: "这是一条已完成的编程提示。",
            completedAt: new Date(),
            mode: "overview",
            requestId: "request_e2e_context",
            status: "success",
            userContent: "我想先理解这道题",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
