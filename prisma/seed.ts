import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveDbOperationAllowed } from "../src/lib/destructiveDbGuard";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const defaultCppTemplate = `#include <bits/stdc++.h>
using namespace std;

int main() {
    return 0;
}
`;

async function main() {
  assertDestructiveDbOperationAllowed();

  await prisma.submissionCaseResult.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.examProblem.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.problem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemSetting.deleteMany();

  await prisma.systemSetting.createMany({
    data: [
      { key: "siteName", value: "C++ OJ" },
      { key: "siteSubtitle", value: "在线练习平台" },
      { key: "browserTitle", value: "" },
      { key: "browserIcon", value: "" },
      { key: "studentNotice", value: "欢迎进入 C++ OJ 练习平台" },
      { key: "adminNotice", value: "欢迎进入后台管理" },
      { key: "defaultCppTemplate", value: defaultCppTemplate },
      { key: "defaultTimeLimitMs", value: "2000" },
      { key: "defaultMemoryLimitMb", value: "128" },
      { key: "allowStudentRegister", value: "false" },
      { key: "aiPracticeEnabled", value: "false" },
    ],
  });

  await prisma.user.createMany({
    data: [
      {
        username: "admin",
        passwordHash: await hashPassword("admin123"),
        role: "admin",
      },
      {
        username: "student1",
        passwordHash: await hashPassword("123456"),
        role: "student",
      },
      {
        username: "student2",
        passwordHash: await hashPassword("123456"),
        role: "student",
      },
    ],
  });

  const abProblem = await prisma.problem.create({
    data: {
      title: "A+B 问题",
      description: "输入两个整数 a 和 b，输出它们的和。",
      inputDescription: "一行两个整数 a 和 b。",
      outputDescription: "输出一个整数，表示 a+b 的结果。",
      sampleInput: "1 2",
      sampleOutput: "3",
      dataRange: "-10^9 <= a,b <= 10^9",
      difficulty: "入门",
      category: "基础语法",
      sortOrder: 1,
      testCases: {
        create: [
          { input: "1 2\n", output: "3\n", isSample: true },
          { input: "10 20\n", output: "30\n", isSample: true },
          { input: "-5 8\n", output: "3\n", isSample: false },
          { input: "100000 234567\n", output: "334567\n", isSample: false },
        ],
      },
    },
  });

  const oddEvenProblem = await prisma.problem.create({
    data: {
      title: "判断奇偶",
      description: "输入一个整数 n，判断它是奇数还是偶数。",
      inputDescription: "一行一个整数 n。",
      outputDescription: "如果是偶数，输出 even；如果是奇数，输出 odd。",
      sampleInput: "4",
      sampleOutput: "even",
      dataRange: "-10^9 <= n <= 10^9",
      difficulty: "入门",
      category: "条件判断",
      sortOrder: 2,
      testCases: {
        create: [
          { input: "4\n", output: "even\n", isSample: true },
          { input: "5\n", output: "odd\n", isSample: true },
          { input: "7\n", output: "odd\n", isSample: false },
          { input: "0\n", output: "even\n", isSample: false },
        ],
      },
    },
  });

  const maxProblem = await prisma.problem.create({
    data: {
      title: "求两个数的最大值",
      description: "输入两个整数 a 和 b，输出较大的那个数。",
      inputDescription: "一行两个整数 a 和 b。",
      outputDescription: "输出 a 和 b 中较大的数。",
      sampleInput: "3 5",
      sampleOutput: "5",
      dataRange: "-10^9 <= a,b <= 10^9",
      difficulty: "入门",
      category: "条件判断",
      sortOrder: 3,
      testCases: {
        create: [
          { input: "3 5\n", output: "5\n", isSample: true },
          { input: "10 7\n", output: "10\n", isSample: true },
          { input: "-1 -9\n", output: "-1\n", isSample: false },
          { input: "42 42\n", output: "42\n", isSample: false },
        ],
      },
    },
  });

  await prisma.exam.create({
    data: {
      title: "五一 C++ 基础模拟考试",
      description: "覆盖输入输出、条件判断和基础表达式，适合用来完整测试考试提交流程。",
      durationMin: 90,
      status: "published",
      aiEnabled: false,
      problems: {
        create: [
          { problemId: abProblem.id, order: 1, score: 100 },
          { problemId: oddEvenProblem.id, order: 2, score: 100 },
          { problemId: maxProblem.id, order: 3, score: 100 },
        ],
      },
    },
  });

  await prisma.exam.create({
    data: {
      title: "草稿考试示例",
      description: "草稿考试不会出现在学生端。",
      durationMin: 60,
      status: "draft",
      aiEnabled: false,
      problems: {
        create: [{ problemId: abProblem.id, order: 1, score: 100 }],
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
