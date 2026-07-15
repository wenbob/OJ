# C++ 在线 OJ 练习平台 Demo

这是一个基于 Next.js 的 C++ 在线 OJ 练习平台 Demo。当前版本已经覆盖编程题与选择判断题两种独立题型、日常刷题、模拟考试、代码提交、自动评测、AI 思路提示、提交详情、错题本与薄弱知识点、学生头衔和天梯榜、管理员题目管理、用户管理、系统设置、Markdown 批量导入、Docker Judge 和基础提交队列等核心流程。

当前项目适合作为本地教学演示、功能验证和 3 名学生左右的小规模正式使用基础。线上使用时必须启用 Docker Judge、强随机 `SESSION_SECRET`、定期 SQLite 备份和管理员密码安全管理；它仍不适合作为大规模公网 OJ 或高并发竞赛平台。

核心流程：

```text
学生登录
-> 日常刷题或模拟考试
-> 查看题目
-> 按管理员开关使用 AI 思路提示（仅编程题）
-> 使用 Monaco Editor 编写 C++17 代码
   或逐行填写选择判断题答案
-> 提交评测
-> 查看整体结果和每个测试点结果
-> 查看日常提交记录或考试提交记录
-> 查看头衔、段位积分和天梯榜

管理员登录
-> 管理题目、用户、考试、系统设置
-> 为学生设置自定义头衔
-> Markdown 批量导入题目
-> 查看日常提交、考试提交和考试记录
```

## 使用文档

- [学生使用说明](docs/student-guide.md)
- [管理员使用和运维说明](docs/admin-guide.md)
- [线上部署与维护手册](docs/deploy.md)

以上三份是当前操作指南；下面的 `ops-review-*` 是按日期保留的历史发布与事故记录，其中的旧命令可能已被后续流程取代，实际部署以 [线上部署与维护手册](docs/deploy.md) 和 `AGENTS.md` 为准。

- [2026-05-06 线上更新复盘与运维经验](docs/ops-review-2026-05-06.md)
- [2026-05-12 单文件热更新记录](docs/ops-review-2026-05-12.md)
- [2026-05-16 复制代码修复记录](docs/ops-review-2026-05-16.md)
- [2026-05-17 模拟考试切题状态修复记录](docs/ops-review-2026-05-17.md)
- [2026-05-29 复制本题与低内存上线记录](docs/ops-review-2026-05-29.md)
- [2026-05-31 学生复制题面与管理员考试练习模式上线记录](docs/ops-review-2026-05-31.md)
- [2026-06-07 Monaco 代码提示关闭上线记录](docs/ops-review-2026-06-07.md)
- [2026-06-13 编辑器字号与 AC 弹窗上线记录](docs/ops-review-2026-06-13.md)
- [2026-06-28 选择判断题型与 standalone 发布记录](docs/ops-review-2026-06-28.md)
- [2026-06-29 OJ 旧版本目录磁盘清理记录](docs/ops-review-2026-06-29.md)
- [2026-07-01 头衔天梯与安全加固上线记录](docs/ops-review-2026-07-01.md)
- [2026-07-02 AI 思路上线与低内存发布事故修正记录](docs/ops-review-2026-07-02.md)
- [2026-07-10 生产运行时加固与发布记录](docs/ops-review-2026-07-10.md)
- [2026-07-11 竞技学院视觉与天梯升级记录](docs/ops-review-2026-07-11.md)
- [2026-07-12 天梯积分差展示上线记录](docs/ops-review-2026-07-12.md)

## 技术栈

- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- Prisma
- SQLite
- bcryptjs
- Monaco Editor
- lucide-react
- Vitest
- 本地 C++ Judge：调用 `g++ -std=c++17 -O2`
- Docker C++ Judge：通过 `JUDGE_MODE=docker` 启用
- 客观题本地判分：不启动 Docker，每行答案对应一道小题
- 内存提交队列：通过 `JUDGE_CONCURRENCY` 控制并发

## 目录概览

```text
src/app                 App Router 页面和 API Route
src/components          共享组件，如 Monaco 编辑器、提交详情、分页、状态标签
src/lib                 认证、Judge、队列、Markdown 解析、考试计分、分页、系统设置等逻辑
prisma/schema.prisma    Prisma 数据模型
prisma/init.sql         SQLite 初始化 SQL
prisma/seed.ts          初始账号、题目、考试和系统设置
docker/judge-cpp        Docker Judge 镜像定义
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 准备环境变量

项目提供 `.env.example`，可以复制为 `.env`：

```bash
cp .env.example .env
```

默认配置：

```env
DATABASE_URL="file:./dev.db"
SESSION_SECRET="replace-this-with-a-long-random-string"
JUDGE_MODE=local
JUDGE_DOCKER_IMAGE=oj-cpp-judge
JUDGE_CONCURRENCY=1
JUDGE_TIME_LIMIT_MS=2000
JUDGE_MEMORY_LIMIT_MB=128
JUDGE_COMPILE_TIMEOUT_MS=30000
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
```

`DEEPSEEK_API_KEY` 只在启用 AI 助手并真实调用 DeepSeek 时需要；不要提交 `.env` 或把真实 key 写进代码。

### 3. 本地开发初始化数据库

```bash
npm run db:init
```

这个命令会生成 Prisma Client，并执行 `prisma/init.sql` 创建 SQLite 表结构。

注意：当前 `prisma/init.sql` 会删除已有表后重建表，本地重置很方便，但执行前请确认不需要保留旧数据。

生产环境禁止运行：

```bash
npm run db:init
```

线上数据库结构必须使用 Prisma Migrate：

```bash
npm run db:deploy
```

### 4. 写入 seed 数据

```bash
npm run seed
```

默认账号：

```text
管理员：admin / admin123
学生一：student1 / 123456
学生二：student2 / 123456
```

Seed 会创建：

- 默认系统设置
- 默认管理员和学生账号
- 初始题目：A+B 问题、判断奇偶、求两个数的最大值
- 每道题至少两组样例和若干测试点
- 已发布模拟考试：五一 C++ 基础模拟考试
- 草稿考试示例

### 5. 启动开发服务

```bash
npm run dev
```

访问：

```text
http://localhost:3000
http://127.0.0.1:3000/login
```

### 6. 常用检查

```bash
npm run test
npx tsc --noEmit
npm run lint
npm run build
```

生产环境上线前还建议执行：

```bash
npm run check:env
npm run db:status
```

## 学生端功能

### 登录与首页

- `/login` 支持账号密码登录。
- 登录成功后按角色跳转：
  - `student` -> `/student`
  - `admin` -> `/admin`
- 学生首页显示系统设置中的 `studentNotice`。
- 页面顶部平台名称读取系统设置中的 `siteName`。
- 登录页、学生端和管理员端共用“竞技学院”视觉语言；动效支持 `prefers-reduced-motion`。
- 学生首页采用“今日任务 + 段位成长”布局，顶部用户信息显示当前头衔、段位积分和天梯排名。

### 头衔与天梯榜

页面：

```text
/student/leaderboard
```

规则：

- 段位积分 = 唯一 Accepted 题数 × 10。
- 同一题多次 Accepted 只计 1 题，日常刷题和考试提交都会纳入统计。
- 晋级门槛为：青铜学徒 0、白银新秀 65、黄金精英 130、铂金高手 260、钻石强者 455、星耀大师 715、最强王者 1040、荣耀王者 1560。
- 管理员自定义头衔只覆盖展示文案，不改变段位积分和排名。
- 天梯榜排序为：积分、唯一 AC 题数、AC 次数、用户名、用户 ID。
- 学生榜和管理员榜都会展示前三名领奖台；学生榜额外展示“我的战绩”、距前一名与第一名的积分差和晋级进度。
- 第四名以后在桌面端使用排名表，移动端使用纵向排名卡片，不需要横向滚动查看核心数据。

### 错题本与薄弱知识点

页面：

```text
/student/review
```

规则：

- 日常刷题和模拟考试的历史提交会合并统计。
- 只要一道题曾经出现非 `Accepted` 提交，就会进入错题本；首次就 `Accepted` 的题不会进入。
- 尚未通过的错题标记为“待攻克”；后续任意一次 `Accepted` 后自动标记为“已攻克”。
- 薄弱知识点按题目分类展示掌握率、待攻克题数和失败尝试次数。
- 可按状态和题目分类筛选，并从最近的日常提交继续修改代码。考试提交会统计进错题本，但不会越权回填到日常练习。

### 日常刷题

页面：

```text
/student/problems
/student/problems/[id]
```

已支持：

- 编程题和选择判断题独立筛选。
- 题目列表分页，默认每页 20 条。
- 顶部按 `Problem.category` 动态生成分类筛选。
- 点击“全部”显示全部题目，点击分类只显示该分类题目。
- 题目列表显示标题、难度、分类、“我的提交”和进入做题入口。
- “我的提交”只统计当前登录学生自己的日常刷题提交，不显示其他学生的提交次数。
- 分类切换后分页自动回到第 1 页。
- 题目详情展示标题、难度、分类、题目描述、输入格式、输出格式、数据范围和样例。
- 样例优先读取 `TestCase.isSample = true` 的全部测试点，按顺序展示多组样例。
- 老数据没有样例测试点时，可 fallback 到 `Problem.sampleInput` 和 `Problem.sampleOutput`。
- 样例标题在代码框外，代码框内只显示真实输入输出内容。
- 学生日常刷题详情和模拟考试答题页提供“复制本题”按钮，可复制 Markdown 格式完整题面。

### Monaco Editor 代码编辑器

学生日常刷题、考试答题和管理员题目练习均使用 Monaco Editor。

支持：

- C++ 语法高亮
- 行号
- Tab 缩进
- 自动缩进
- 自动补全括号和引号
- 括号匹配
- 代码折叠
- 粘贴保留格式
- 暗色主题
- 固定编辑器高度
- 编辑器字号调节
- 本地草稿保存

为减少课堂答题干扰，Monaco Editor 已关闭自动代码提示、单词建议、Tab 补全、参数提示和内联建议；括号和引号自动补全仍保留。

默认代码模板读取系统设置 `defaultCppTemplate`。

选择判断题仍复用 Monaco Editor，但使用纯文本模式，标题显示“答案输入”，每行只填写一道小题的选项字母，例如：

```text
A
B
A
```

代码加载优先级：

```text
fromSubmission 历史提交代码
> localStorage 草稿
> SystemSetting.defaultCppTemplate
> 代码内兜底模板
```

日常题目草稿 key：

```text
oj-code-problem-${problemId}
```

模拟考试草稿 key：

```text
oj-code-exam-${examId}-problem-${problemId}
```

考试答题页按考试和题目隔离草稿，切换题目时会加载该题自己的草稿，不复用其他考试题目的代码。

### 代码提交与评测

学生可以提交 C++17 代码，评测结果包括：

- Accepted
- Wrong Answer
- Compile Error
- Runtime Error
- Time Limit Exceeded

提交后保存：

- 整体提交记录 `Submission`
- 每个测试点结果 `SubmissionCaseResult`

每个测试点结果包含：

- 测试点编号
- 状态
- 运行时间
- 输入内容
- 用户输出
- 标准输出
- 错误信息

提交后的结果卡片会直接展示一个“程序输出”区域，优先显示第一个未通过测试点的用户输出；如果全部通过，则显示第一个测试点输出。完整输入、标准输出和所有测试点结果仍可进入提交详情页查看。

当提交结果为 `Accepted` 时，页面会居中显示透明背景的通过提示图片，带短暂弹入和淡出动效，并在约 1 秒后自动消失。

### 日常提交记录

页面：

```text
/student/submissions
/student/submissions/[id]
```

已支持：

- 只显示当前学生自己的日常刷题提交。
- 只查询 `submissionType = practice`。
- 分页展示，默认每页 20 条。
- 查看提交详情。
- 复制历史代码。
- 继续修改历史提交代码。
- 学生不能查看或复制其他学生的提交。
- 公网 HTTP 页面会使用兼容复制方案，避免浏览器禁用 Clipboard API 导致复制失败。

日常提交的“继续修改”跳转：

```text
/student/problems/[problemId]?fromSubmission=提交ID
```

### 模拟考试

页面：

```text
/student/exams
/student/exams/[id]
/student/exams/[id]/take
/student/exams/[id]/result
```

已支持：

- 学生只看到 `published` 状态考试。
- `draft` 和 `ended` 不出现在学生可参加考试列表中。
- 考试详情展示考试名称、说明、题目数量和考试时长。
- 点击开始考试会创建 `ExamRecord`。
- 同一学生同一场考试只创建一条考试记录。
- 已有 `in_progress` 记录时继续考试。
- 已交卷或超时后不能继续答题，只能查看结果。
- 编程考试和多大题考试答题页显示题目列表和每题当前状态。
- 单大题选择判断考试隐藏题目列表，扩大题面展示区域。
- 主体区域显示当前题目详情、Monaco Editor、提交按钮和最新一次提交结果。
- 考试中切换题目时，编辑器会加载当前题目的独立草稿和结果区域。
- 考试中提交成功后，有题目列表时会刷新该题的最新评测状态。
- 考试中提交代码会保存 `submissionType = exam` 和当前 `examId`。
- 考试题目状态只统计当前考试下当前学生的提交，不混入日常刷题提交。
- 页面显示倒计时。
- 编程考试支持手动交卷；选择判断考试通过“提交答案”二次确认后交卷。
- 超时后自动结束并跳转结果页。
- 结果页展示考试记录、状态、开始时间、交卷时间、总分和每题得分。

成绩规则：

```text
编程题：有 Accepted 则获得 ExamProblem.score 满分，否则 0 分。
选择判断题：按一次提交中答对的小题分值累计，并取该题所有提交中的最高分。
```

### 考试提交记录

页面：

```text
/student/exam-submissions
```

已支持：

- 题型筛选：编程题 / 选择判断题。
- 手动新增和编辑选择判断题小题、选项、答案与分值。
- 只显示当前学生自己的考试提交。
- 只查询 `submissionType = exam`。
- 分页展示，默认每页 20 条。
- 显示考试名称、题目、状态、通过测试点数、运行时间和提交时间。
- 查看详情。
- 复制代码。
- 继续修改。

考试提交的“继续修改”跳转：

```text
/student/exams/[examId]/take?problemId=题目ID&fromSubmission=提交ID
```

## 管理员端功能

### 管理员首页

页面：

```text
/admin
```

入口包括：

- 题目管理
- 用户管理
- 题目练习
- 模拟考试管理
- 日常提交记录
- 考试提交记录
- 系统设置功能卡片

管理员首页公告读取系统设置中的 `adminNotice`。

### 题目管理

页面：

```text
/admin/problems
```

已支持：

- 创建考试时选择 `programming` 或 `objective`，一场考试不能混合题型。
- 题目列表分页，默认每页 20 条。
- 按 `Problem.category` 动态分类筛选。
- 新增题目。
- 编辑题目。
- 单个删除题目。
- 批量选择题目。
- 全选当前页。
- 批量删除题目。
- 删除前二次确认。
- 删除成功后刷新列表并清空选中状态。
- 分页或筛选变化后清空选中状态，避免误删。
- 新增和编辑题目时维护测试点。
- 新增和编辑题目时至少需要两组样例测试点。
- 题目分类会影响学生端和管理员端的分类筛选。
- 题目列表中的提交数量统计日常刷题总提交次数，点击数字会跳转到按该题筛选后的 `/admin/submissions?problemId=题目ID`。

批量删除接口：

```text
POST /api/admin/problems/bulk-delete
```

请求：

```ts
{
  problemIds: number[]
}
```

返回：

```ts
{
  deletedCount: number
}
```

说明：

- 只有 admin 可以访问。
- `problemIds` 必须是非空数组。
- 每个 ID 必须是有效数字。
- 删除使用事务。
- 不存在的 ID 会被忽略，返回实际删除数量。
- 题目的测试点、提交记录、提交测试点结果和考试题目关联依赖数据库级联删除。

### 管理员题目练习

页面：

```text
/admin/practice
/admin/practice/problems/[id]
```

已支持：

- 管理员可以像学生一样查看题目并提交 C++ 代码。
- 题目列表支持分类筛选和分页。
- 题目列表中的提交数量可点击进入该题日常提交记录筛选页。
- 题目详情复用 Monaco Editor 和 Judge 流程。
- 题目详情页提供管理员专用“复制本题”按钮，可复制 Markdown 格式完整题面。
- 管理员提交也保存到 `Submission`，并可在管理员提交记录中查看。

### 用户管理

页面：

```text
/admin/users
```

已支持：

- 查看用户列表。
- 新增学生或管理员账号。
- 编辑用户名和角色。
- 设置或清空学生自定义头衔。
- 重置密码。
- 删除用户。
- 删除前二次确认。
- 不能删除当前登录账号。
- 密码使用 `passwordHash` 保存，不明文存储。

### 日常提交记录

页面：

```text
/admin/submissions
/admin/submissions/[id]
```

已支持：

- 只显示 `submissionType = practice` 的日常刷题提交。
- 管理员可以查看所有用户的日常提交。
- 分页展示，默认每页 20 条。
- 支持筛选：
  - 用户名
  - 用户角色
  - 题目
  - 状态
  - 开始日期
  - 结束日期
- 查看提交详情。
- 复制提交代码。

### 考试提交记录

页面：

```text
/admin/exam-submissions
```

已支持：

- 只显示 `submissionType = exam` 的考试提交。
- 管理员可以查看所有用户的考试提交。
- 分页展示，默认每页 20 条。
- 支持筛选：
  - 考试
  - 用户名
  - 用户角色
  - 题目
  - 状态
  - 开始日期
  - 结束日期
- 查看提交详情。
- 复制提交代码。

### 模拟考试管理

页面：

```text
/admin/exams
/admin/exams/new
/admin/exams/[id]/edit
/admin/exams/[id]/practice
/admin/exams/[id]/records
```

已支持：

- 创建考试。
- 编辑考试名称、说明、时长和状态。
- 发布考试。
- 取消发布。
- 删除考试。
- 删除前二次确认。
- 发布前校验：
  - 考试标题不能为空。
  - 考试时长必须大于 0。
  - 考试至少包含 1 道题。
  - 每道题必须有分值。
  - 每道题分值必须大于 0。
- 从已有日常题库搜索题目并添加到考试。
- 按题目分类筛选可加入考试的题目。
- 勾选单道题目或全选当前搜索结果，批量加入考试。
- 从考试中移除题目。
- 移除前二次确认。
- 设置考试题目顺序。
- 设置每题分值。
- 通过 Markdown 导入题目并自动加入考试。
- 从考试列表进入管理员练习模式，按考试题单逐题查看和提交代码；该模式不限时、不需要交卷，提交计入日常提交。
- 查看考试记录。

考试状态：

```text
draft      草稿，学生不可见
published  已发布，学生可开始或继续考试
ended      已结束，学生端不可继续答题和提交
```

考试记录页面：

```text
/admin/exams/[id]/records
```

已支持：

- 分页展示考试记录，默认每页 20 条。
- 显示学生、开始时间、交卷时间、状态和总分。
- 支持按用户名搜索。

### 系统设置

页面：

```text
/admin/settings
```

管理员可以配置：

- 平台名称 `siteName`
- 平台副标题 `siteSubtitle`
- 学生端公告 `studentNotice`
- 管理员端公告 `adminNotice`
- 默认 C++ 代码模板 `defaultCppTemplate`
- 默认评测时间限制 `defaultTimeLimitMs`
- 默认评测内存限制 `defaultMemoryLimitMb`
- 日常练习 AI 助手开关 `aiPracticeEnabled`
- 是否允许学生自助注册 `allowStudentRegister`

说明：

- 当前暂未开放学生自助注册页，`allowStudentRegister` 是预留开关。
- 登录页、学生端布局、管理员端布局和首页公告会读取系统设置。
- 默认 C++ 模板已接入 Monaco Editor。
- 默认评测时间和内存已接入提交接口。
- 日常练习 AI 关闭时，学生日常刷题页不显示 AI 按钮，服务端接口也会拒绝请求。
- 环境变量仍作为系统设置缺失时的兜底。

默认评测限制优先级：

```text
SystemSetting 默认限制
> 环境变量 JUDGE_TIME_LIMIT_MS / JUDGE_MEMORY_LIMIT_MB
> 代码兜底值
```

相关接口：

```text
GET /api/settings/public
GET /api/admin/settings
PUT /api/admin/settings
```

## Markdown 导入题目

### 支持能力

当前 Markdown 导入支持：

- 单题导入。
- 多题批量导入。
- 导入到日常题库。
- 导入到指定考试，并自动加入当前考试。
- 每道题独立设置难度。
- 每道题独立设置分类。
- 页面默认难度和默认分类作为兜底。
- 每道题至少两组样例。
- 样例代码块只保存真实输入输出内容，不保存 Markdown 标题和代码块标记。
- 后端确认导入时再次校验。
- 使用数据库事务，避免导入一半成功一半失败。

入口：

```text
/admin/problems/import
/admin/exams/[id]/import
```

### Markdown 标准格式

一个 Markdown 文件可以包含一道或多道题。每道题以一级标题 `#` 开始。

每道题推荐包含：

```text
## 难度
## 分类
## 题目描述
## 输入格式
## 输出格式
## 样例
## 数据范围
```

示例：

````markdown
# A+B 问题

## 难度

入门

## 分类

基础语法

## 题目描述

输入两个整数 a 和 b，输出它们的和。

## 输入格式

一行两个整数 a 和 b。

## 输出格式

输出一个整数，表示 a+b 的结果。

## 样例

### 输入样例 1

```text
1 2
```

### 输出样例 1

```text
3
```

### 输入样例 2

```text
10 20
```

### 输出样例 2

```text
30
```

## 数据范围

1 <= a, b <= 1000
````

选择判断题格式：

````markdown
# GESP 选择判断标准样例

## 题型

选择判断

## 难度

入门

## 分类

GESP 一级

## 题目描述

请按题号顺序作答，每行填写一个答案字母。

## 客观题

### 第 1 题

在 C++ 中，下列不可做变量名的是（ ）。

A. five-Star
B. five_star
C. fiveStar
D. _fiveStar

答案：A
分值：2

### 第 2 题

阅读下面代码，判断输出结果。

```cpp
int a = 3;
int b = 4;
cout << a + b << endl;
```

A. 输出 `7`
B. 输出 `34`
C. 编译错误
D. 没有输出

答案：A
分值：2

### 第 3 题

`break` 语句可以终止当前循环。（ ）

A. 正确
B. 错误

答案：A
分值：2
````

### Markdown 导入限制

- 样例必须使用 `### 输入样例 N` 和 `### 输出样例 N`。
- 样例输入和输出必须成对。
- 每道题至少两组样例。
- 样例内容必须放在代码块中。
- 当前导入的测试点都作为样例测试点保存。
- 客观题支持单选题和判断题；判断题固定使用 A/B。
- 客观题分值必须是正整数。
- 客观题选项必须写成单行 `A. 选项内容`；不要写 `A.` 后再另起代码块。
- 客观题题干可以使用 Markdown 代码块；做题页会渲染为代码样式，不显示原始 ```cpp 标记。
- 客观题选项里需要代码或输出时，用行内代码，例如 `A. 输出 \`7\``。
- 暂不支持在 Markdown 中设置隐藏测试点、标签、考试分值或排序。

## Judge 与提交队列

当前保留统一接口：

```ts
judgeCppCode({
  code,
  testCases,
  timeLimitMs,
  memoryLimitMb
})
```

内部通过 `JUDGE_MODE` 切换实现。

### local Judge

```env
JUDGE_MODE=local
```

local Judge 会在本机临时目录写入 `main.cpp`，调用本机 `g++` 编译，并直接运行生成的程序。

保护规则：

- `NODE_ENV=production` 时禁止使用 local Judge。
- 如果生产环境配置为 `JUDGE_MODE=local`，提交评测和健康检查会报错：`生产环境禁止使用 local Judge，请设置 JUDGE_MODE=docker`。

适合：

- 本地开发
- 本地 Demo
- 无 Docker 的快速验证

风险：

- 会直接在宿主机运行用户代码。
- 不适合公网环境。
- 不适合真实学生长期使用。

### Docker Judge

```env
JUDGE_MODE=docker
JUDGE_DOCKER_IMAGE=oj-cpp-judge
```

构建镜像：

```bash
docker build -t oj-cpp-judge ./docker/judge-cpp
```

启动项目：

```bash
npm run dev
```

Docker Judge 会在容器中编译和运行学生代码，并尽量使用以下限制：

- `--network none`：禁止访问网络。
- `--memory`：限制内存，值来自 `JUDGE_MEMORY_LIMIT_MB`。
- `--cpus 1`：限制 CPU。
- `--pids-limit 64`：限制进程数量。
- `--read-only`：容器根文件系统只读。
- `--cap-drop ALL`：移除 Linux capabilities。
- `--security-opt no-new-privileges`：禁止提权。
- `--tmpfs /tmp:rw,noexec,nosuid,size=64m`：提供临时编译空间。
- `-v 临时目录:/workspace`：每次提交使用独立临时目录，结束后清理。

注意：Docker Judge 比本机直接运行更安全，但仍不是完整竞赛级沙箱。后续可以继续接入 nsjail、isolate、seccomp、Kubernetes Job 或独立评测服务。

### 基础提交队列

提交接口会通过内存队列控制评测并发：

```env
JUDGE_CONCURRENCY=1
```

说明：

- 默认同时只运行 1 个 Judge 任务。
- 日常提交和考试提交都走同一个队列。
- 一个任务失败不会卡住后续任务。
- 当前是 Demo 级内存队列，服务重启后等待中的任务会丢失。
- 正式多实例部署建议替换为 Redis、消息队列或独立评测服务。

## 数据库模型

核心表：

- `User`：用户账号，包含 `student` 和 `admin` 两种角色。
- `StudentProfile`：学生扩展档案，保存管理员自定义头衔；积分和段位实时从提交记录计算，不写入该表。
- `Problem`：题目主体信息，包含标题、描述、难度、分类和第一组样例。
- `Problem.problemType`：`programming` 或 `objective`；客观题小题 JSON 保存于 `objectiveItems`。
- `TestCase`：测试点，包含样例测试点和隐藏测试点。
- `Submission`：提交记录，保存整体评测结果、提交代码、语言、`submissionType` 和可选 `examId`。
- `SubmissionCaseResult`：单个测试点评测结果。
- `Exam`：模拟考试。
- `Exam.examType`：限制整场考试只能包含同类型题目。
- `ExamProblem`：考试和题目的关联，包含题目顺序和分值。
- `ExamRecord`：学生参加某场考试的记录，包含开始时间、交卷时间、状态和总分。
- `SystemSetting`：系统设置，按 key-value 保存站点配置。

提交类型：

```text
submissionType = practice    日常刷题提交
submissionType = exam        模拟考试提交
```

`Submission.examId` 只用于关联具体考试，不再作为判断提交类型的唯一依据。这样即使考试被删除导致 `examId` 变为 `null`，考试提交也不会混入日常提交记录。

重要关系：

- 删除题目会级联删除测试点、提交记录和考试题目关联。
- 删除提交会级联删除测试点结果。
- 删除考试会级联删除考试题目关联和考试记录。
- `Submission.examId` 对 `Exam` 是 `ON DELETE SET NULL`。

## 数据库迁移与备份

### 本地重置

本地开发需要清空并重建数据库时可以运行：

```bash
npm run db:init
npm run seed
```

再次提醒：`db:init` 会执行破坏式 `prisma/init.sql`，生产环境禁止运行。

### Prisma Migrate

当前已经引入 Prisma Migrate：

```text
prisma/migrations/0001_initial/migration.sql
```

本地开发创建新迁移：

```bash
npm run db:migrate
```

生产环境应用迁移：

```bash
npm run db:deploy
```

查看迁移状态：

```bash
npm run db:status
```

如果你已经有一个由旧版 `db:init` 创建、且需要保留数据的 SQLite 数据库，不能直接对它执行初始迁移。应先备份数据库，确认表结构与当前 schema 一致后执行：

```bash
npm run db:baseline
```

这会把 `0001_initial` 标记为已应用，然后后续新迁移再使用 `npm run db:deploy`。

### SQLite 备份

本阶段 3 名学生小规模正式使用可以继续使用 SQLite，但必须定期备份。

Windows PowerShell：

```powershell
npm run backup:sqlite
# 或
powershell -ExecutionPolicy Bypass -File scripts/backup-sqlite.ps1
```

Linux：

```bash
bash scripts/backup-sqlite.sh
```

默认备份：

```text
源文件：prisma/dev.db
目标目录：backups/
文件名：dev-YYYYMMDD-HHMMSS.db
```

Linux cron 示例，每天凌晨 2 点备份：

```bash
0 2 * * * cd /path/to/oj && bash scripts/backup-sqlite.sh
```

Windows 可以使用“任务计划程序”定时运行 `scripts/backup-sqlite.ps1`。

## 主要页面

学生端：

```text
/student
/student/problems
/student/problems/[id]
/student/submissions
/student/submissions/[id]
/student/exam-submissions
/student/leaderboard
/student/exams
/student/exams/[id]
/student/exams/[id]/take
/student/exams/[id]/result
```

管理员端：

```text
/admin
/admin/problems
/admin/problems/import
/admin/practice
/admin/practice/problems/[id]
/admin/users
/admin/leaderboard
/admin/submissions
/admin/submissions/[id]
/admin/exam-submissions
/admin/exams
/admin/exams/new
/admin/exams/[id]/edit
/admin/exams/[id]/import
/admin/exams/[id]/records
/admin/settings
```

## 主要 API

认证：

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

公共设置：

```text
GET /api/settings/public
```

健康检查：

```text
GET /api/health
```

返回示例：

```json
{
  "ok": true,
  "database": "ok",
  "timestamp": "2026-05-04T00:00:00.000Z"
}
```

学生端：

```text
GET  /api/problems
GET  /api/problems/[id]
POST /api/problems/[id]/submit
GET  /api/submissions/my
GET  /api/submissions/[id]

GET  /api/exams
GET  /api/exams/[id]
GET  /api/exams/[id]/take
POST /api/exams/[id]/start
POST /api/exams/[id]/submit
POST /api/exams/[id]/expire
GET  /api/exam-submissions/my
```

管理员端：

```text
GET    /api/admin/problems
POST   /api/admin/problems
PUT    /api/admin/problems/[id]
DELETE /api/admin/problems/[id]
POST   /api/admin/problems/bulk-delete
GET    /api/admin/problems/search
POST   /api/admin/problems/import/parse
POST   /api/admin/problems/import/confirm

GET    /api/admin/users
POST   /api/admin/users
PUT    /api/admin/users/[id]
DELETE /api/admin/users/[id]

GET    /api/admin/submissions
GET    /api/admin/submissions/[id]
GET    /api/admin/exam-submissions

GET    /api/admin/exams
POST   /api/admin/exams
GET    /api/admin/exams/[id]
PUT    /api/admin/exams/[id]
DELETE /api/admin/exams/[id]
POST   /api/admin/exams/[id]/publish
POST   /api/admin/exams/[id]/unpublish
POST   /api/admin/exams/[id]/problems
DELETE /api/admin/exams/[id]/problems/[examProblemId]
POST   /api/admin/exams/[id]/import/parse
POST   /api/admin/exams/[id]/import/confirm

GET    /api/admin/settings
PUT    /api/admin/settings
```

管理员用户接口支持 `customTitle` 字段：创建或编辑学生时可设置最多 20 字的自定义头衔；留空则使用自动段位名。

## 分页与筛选

已支持分页的页面：

- `/student/problems`
- `/admin/problems`
- `/admin/practice`
- `/student/submissions`
- `/student/exam-submissions`
- `/admin/submissions`
- `/admin/exam-submissions`
- `/admin/exams/[id]/records`

默认每页 20 条。

分页接口返回结构：

```ts
{
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

题目列表支持分类筛选：

```text
GET /api/problems?page=1&pageSize=20&category=基础语法
GET /api/admin/problems?page=1&pageSize=20&category=基础语法
```

管理员提交记录支持用户名、角色、题目、状态、日期范围等筛选。管理员考试提交记录额外支持考试筛选。

## 小规模正式部署指南

完整部署、回滚、备份和容量操作以 [docs/deploy.md](docs/deploy.md) 为准，README 只保留关键红线：

- 线上 `/www/oj` 使用 SQLite + Docker Judge + `JUDGE_CONCURRENCY=1`，适合小规模长期使用。
- 生产 `DATABASE_URL` 必须是绝对路径，例如 `file:/www/oj/prisma/prod.db`，禁止使用 `file:./prod.db`。
- 常规发布前必须备份 `/www/oj/prisma/prod.db` 到 `/www/backups`，且确认备份文件存在。
- 常规发布优先在本地 Linux/Docker 环境生成 Next.js standalone 产物并上传；不要把 Windows 本机 `.next/standalone` 当作 Ubuntu 产物。
- 2GB 服务器上常规发布不要执行 `npm ci` 或全量 Next build；只有应急时才按 `docs/deploy.md` 的单 worker 低内存流程处理。
- 发布包必须排除 `.env`、数据库文件、备份文件、`.next/cache` 和压缩包；服务器继续使用 `/www/oj/.env` 和 `/www/oj/prisma/prod.db`。
- 生产环境禁止常规执行 `npm run seed` 或 `npm run db:init`。
- 磁盘清理只处理 OJ 明确路径；不要删除其它网站、股票系统目录，或执行未经确认的 Docker 全局 prune。

## 上线前检查清单

```text
[ ] 服务器 Docker 可用
[ ] docker run hello-world 通过
[ ] Docker Judge 镜像构建成功
[ ] NODE_ENV=production
[ ] JUDGE_MODE=docker
[ ] SESSION_SECRET 已改成强随机字符串
[ ] npm run check:env 通过
[ ] 默认管理员密码已修改
[ ] npm run test 通过
[ ] npx tsc --noEmit 通过
[ ] npm run lint 通过
[ ] npm run build 通过
[ ] npm run db:deploy 已执行
[ ] 数据库已备份
[ ] /api/health 返回 ok
[ ] Accepted 冒烟测试通过
[ ] Wrong Answer 冒烟测试通过
[ ] Compile Error 冒烟测试通过
[ ] Runtime Error 冒烟测试通过
[ ] Time Limit Exceeded 冒烟测试通过
[ ] 学生账号已准备
[ ] 登录流程已人工验收
[ ] 日常刷题提交流程已人工验收
[ ] 模拟考试开始、提交、交卷、结果页已人工验收
[ ] 管理员提交记录和考试记录已人工验收
```

## 当前限制和风险

高优先级风险：

- local Judge 会直接在宿主机运行用户代码，不适合公网。
- Docker Judge 仍不是完整竞赛级沙箱，建议继续增强隔离能力。
- 当前账号体系仍是轻量 Cookie Session；已具备登录失败限流、会话有效期和同源变更请求校验，但还没有验证码、找回密码、操作审计和多因素认证等完整账号安全能力。
- SQLite 适合 Demo，不适合高并发正式场景。
- 提交详情会展示所有测试点输入输出，正式 OJ 通常需要隐藏非样例测试点。

工程限制：

- 当前数据库结构主要靠 `prisma/init.sql` 初始化，还没有完整采用 Prisma Migrate 工作流。
- `prisma/init.sql` 和 `prisma/schema.prisma` 需要手动保持同步。
- 内存提交队列不适合多实例部署。
- 自动化测试覆盖主要集中在 Markdown 解析、样例展示和队列逻辑，端到端权限和考试流程测试仍需补强。

业务限制：

- 学生自助注册只是系统设置预留项，当前没有开放注册页。
- 考试已支持开始记录、倒计时、交卷、超时和基础计分，但还没有复杂成绩分析、排行榜、班级维度统计和成绩导出。
- `ended` 状态由管理员手动维护，不是后台定时自动结束考试。
- 删除考试后，相关提交的 `submissionType = exam` 会保留，但 `examId` 会变为空，因此提交详情无法继续展示原考试名称。
- Markdown 导入依赖严格模板，暂不支持隐藏测试点、标签、分值和排序。

## 下一步建议

第 1 阶段：评测安全增强

- 接入 nsjail、isolate 或 seccomp。
- 为 Docker Judge 增加更细粒度文件系统和系统调用限制。
- 将内存队列替换为 Redis 或独立评测服务。

第 2 阶段：考试结果完善

- 管理员考试结果汇总页。
- 学生成绩排名。
- 每题通过率和错误统计。
- 成绩导出。

第 3 阶段：教学管理能力

- 班级管理。
- 作业发布。
- 批量导入学生账号。

第 4 阶段：工程化

- 引入 Prisma Migrate。
- 补充端到端测试。
- 补充接口权限测试。
- 增加操作审计日志。

第 5 阶段：题库增强

- 题目标签系统。
- 隐藏测试点导入。
- 题目难度统计。
- 批量编辑题目分类和难度。

## 当前版本结论

当前版本已经适合作为本地 Demo、课堂演示、内部功能验证，以及约 3 名学生的小规模正式使用。

当前版本不建议直接扩展为大规模公网 OJ 或高并发竞赛平台。真实使用时必须保持 `JUDGE_MODE=docker`、定期备份 SQLite、关闭公网 3000 端口，并避免重复执行 `npm run seed` / `npm run db:init`。

如果要扩大使用规模，最低需要继续完成：

- 将 SQLite 迁移到 PostgreSQL。
- 将内存队列升级为 Redis / BullMQ 或独立 Judge 服务。
- 隐藏非样例测试点输入输出。
- 补充端到端权限测试和真实 Docker Judge 冒烟测试脚本。
- 配置域名、HTTPS、自动备份和更完整的监控告警。
- 为考试结果和成绩统计补充更完整的管理视图。
