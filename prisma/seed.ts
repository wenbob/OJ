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
      { key: "aiObjectiveExplanationEnabled", value: "false" },
      { key: "aiConversationRetentionDays", value: "180" },
      { key: "aiProvider", value: "deepseek" },
      { key: "aiBaseUrl", value: "https://api.deepseek.com" },
      { key: "aiModel", value: "deepseek-v4-pro" },
      { key: "aiThinkingMode", value: "enabled" },
      { key: "aiCustomThinkingProtocol", value: "none" },
      { key: "aiObjectiveProvider", value: "deepseek" },
      { key: "aiObjectiveBaseUrl", value: "https://api.deepseek.com" },
      { key: "aiObjectiveModel", value: "deepseek-v4-pro" },
      { key: "aiObjectiveThinkingMode", value: "enabled" },
      { key: "aiObjectiveCustomThinkingProtocol", value: "none" },
      { key: "aiProgrammingStudentCooldownSeconds", value: "20" },
      { key: "aiProgrammingTeacherCooldownSeconds", value: "30" },
      { key: "aiProgrammingAdminCooldownSeconds", value: "30" },
      { key: "aiObjectiveTeacherCooldownSeconds", value: "30" },
      { key: "aiObjectiveAdminCooldownSeconds", value: "30" },
      { key: "aiObjectiveStudentCooldownSeconds", value: "30" },
      { key: "aiStudentObjectiveExplanationEnabled", value: "false" },
      { key: "aiStaffProgrammingAssistEnabled", value: "false" },
      {
        key: "aiProgrammingOverviewPrompt",
        value: `帮助学生理解这道题，不读取或猜测学生代码。

请按三个部分回答：
题目分析：用 2 到 4 句讲清楚输入是什么、要找到什么、最后输出什么。
解题步骤：根据题目难度决定 3 到 6 步，每一步用“第一步、第二步……”开头，讲清楚具体要想什么、比较什么、记录什么。
小提醒：最后只提醒一个最容易错的地方。`,
      },
      {
        key: "aiProgrammingNextStepPrompt",
        value: `根据当前题目和学生已经写好的代码，只告诉学生现在最应该完成的一个小步骤。

先用一句话说学生已经做到哪里，再用 2 到 4 句说明下一步要检查、比较、记录或补充什么。不要继续讲后面的完整解法。`,
      },
      {
        key: "aiProgrammingCodeReviewPrompt",
        value: `检查学生当前代码。

最多指出三个真正影响结果的问题。每个问题必须说清楚“第几行、哪里不对、为什么会出问题、学生应该检查什么”。只允许说行号和自然语言问题，不要复述该行源码、变量表达式或正确写法。如果暂时看不出错误，就说明已经完成了什么，并只给下一项检查方向。`,
      },
      {
        key: "aiProgrammingQuestionPrompt",
        value: `先判断学生本次问题是否与当前题目、当前代码或当前解法直接相关。

如果无关，只能原样返回系统规定的无关问题回复。如果相关，就结合当前代码和历史对话回答学生现在问的这一小点。只回答当前这一问，不扩展成完整解法。`,
      },
      {
        key: "aiObjectiveExplanationPrompt",
        value: `请使用简短、清楚、适合学生阅读的中文解释这道选择判断题。

先说明整体判断思路，再按原顺序解释每个选项：正确项说明为什么正确，错误项逐一指出错在哪里。最后用一句容易记住的话总结知识点。专业术语首次出现时要顺手解释。允许少量 Markdown、行内代码和 LaTeX，但不要使用表格。`,
      },
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
