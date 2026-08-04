-- Store administrator-editable teaching instructions while keeping the
-- security envelope and response contracts in application code.
INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES (
  'aiProgrammingOverviewPrompt',
  '帮助学生理解这道题，不读取或猜测学生代码。

请按三个部分回答：
题目分析：用 2 到 4 句讲清楚输入是什么、要找到什么、最后输出什么。
解题步骤：根据题目难度决定 3 到 6 步，每一步用“第一步、第二步……”开头，讲清楚具体要想什么、比较什么、记录什么。
小提醒：最后只提醒一个最容易错的地方。',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES (
  'aiProgrammingNextStepPrompt',
  '根据当前题目和学生已经写好的代码，只告诉学生现在最应该完成的一个小步骤。

先用一句话说学生已经做到哪里，再用 2 到 4 句说明下一步要检查、比较、记录或补充什么。不要继续讲后面的完整解法。',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES (
  'aiProgrammingCodeReviewPrompt',
  '检查学生当前代码。

最多指出三个真正影响结果的问题。每个问题必须说清楚“第几行、哪里不对、为什么会出问题、学生应该检查什么”。只允许说行号和自然语言问题，不要复述该行源码、变量表达式或正确写法。如果暂时看不出错误，就说明已经完成了什么，并只给下一项检查方向。',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES (
  'aiProgrammingQuestionPrompt',
  '先判断学生本次问题是否与当前题目、当前代码或当前解法直接相关。

如果无关，只能原样返回系统规定的无关问题回复。如果相关，就结合当前代码和历史对话回答学生现在问的这一小点。只回答当前这一问，不扩展成完整解法。',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES (
  'aiObjectiveExplanationPrompt',
  '请使用简短、清楚、适合学生阅读的中文解释这道选择判断题。

先说明整体判断思路，再按原顺序解释每个选项：正确项说明为什么正确，错误项逐一指出错在哪里。最后用一句容易记住的话总结知识点。专业术语首次出现时要顺手解释。允许少量 Markdown、行内代码和 LaTeX，但不要使用表格。',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
