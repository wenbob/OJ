# C++ 在线 OJ 练习平台 Demo

这是一个基于 Next.js 的 C++ 在线 OJ 练习平台 Demo。当前版本已经覆盖编程题与选择判断题两种独立题型、日常刷题、模拟考试、考试防退出、学生单设备登录、历史 AC 题目标记、运行样例与自定义输入、代码提交、自动评测、AI 思路提示、提交详情、错题本与薄弱知识点、教师学情看板与专项练习、学生头衔和天梯榜、管理员题目管理、用户管理、系统设置、Markdown 批量导入、Docker Judge 和基础提交队列等核心流程。

当前项目适合作为本地教学演示、功能验证和固定小班、低并发的正式教学使用基础。线上使用时必须启用 Docker Judge、强随机 `SESSION_SECRET`、定期 SQLite 备份和管理员密码安全管理；它仍不适合作为大规模公网 OJ 或高并发竞赛平台。

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
- [2026-07-15 AI 分层辅导、教师学情看板、专项练习与浏览器标签配置上线记录](docs/ops-review-2026-07-15.md)
- [2026-07-16 运行样例、历史积分保护与学生会话加固记录](docs/ops-review-2026-07-16.md)
- [2026-07-21 多文档导入与选择判断公式渲染上线记录](docs/ops-review-2026-07-21.md)

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

### 分层 AI 学习助手

- AI 只在编程题中出现，并同时受“学生个人 AI 权限”和日常练习/当前考试 AI 开关控制；任一条件关闭时页面隐藏，服务端也拒绝请求。
- 学生可以选择“理解题目”“下一步提示”“检查当前代码”，也可以自由追问当前题目；后两类提示和自由提问会读取编辑器里的最新代码。
- AI 只讲当前题目的意思、思路、下一步动作和问题位置，不提供完整代码、可复制代码语句、最终答案或隐藏测试数据。
- 学生端在当前浏览器保留最近 20 条消息，发给 AI 时只携带最近 12 条；服务端另存学生实际可见问答和调用统计供老师审阅，但不保存代码快照、完整 Prompt 或内部推理。
- 同一学生在所有题目、考试和模式中共用服务端 20 秒冷却；只有不包含学生代码和对话的“理解题目”可使用同题 5 分钟缓存。
- 请求发出后页面会立即显示思考状态，并每 2 秒更新用时；最终回复通过安全检查后逐段流式出现，难题等待期间不会呈现为页面卡死。

### 专项练习

- 学生首页和 `/student/assignments` 展示老师下发的专项练习、说明、截止日期和完成进度。
- 只有从专项练习详情进入题目，并在任务仍为进行中时重新提交 `Accepted`，才会计入该任务；普通日常提交、考试提交、历史 AC 都不会抵扣。
- 过期任务会标红提醒但仍可补做；归档任务之后的提交不再计入进度，管理员可选择永久删除已归档任务。

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
- 日常或考试中只要曾经 `Accepted`，题目行就会显示淡绿色和“已通过”，操作改为“再次练习”；之后提交失败不会取消标记。
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

### 运行样例与自定义输入

所有编程题编辑器都提供“运行样例 / 自定义输入”双标签，包括学生日常练习、专项练习、编程考试、管理员题目练习和管理员考试练习；选择判断题不显示。

- “运行样例”由服务端读取全部公开样例，一次编译后逐组运行并比较输出；浏览器不能提交或覆盖样例标准答案，也不会读取隐藏测试点。
- “自定义输入”允许空输入，只展示程序实际输出、运行时间或编译/运行错误，不判定 Accepted 或 Wrong Answer。
- 试运行结果和正式提交结果相互独立，完成后分别自动滚动到对应结果区。
- 试运行不会创建 `Submission`，不会影响天梯积分、错题本、考试成绩或专项练习进度，也不会触发 AC 动画。
- 每个账号同时只能进行一个试运行，完成后等待 5 秒才能再次运行；正式提交仍可在试运行期间发起，并优先于尚未开始的试运行排队。

样例通过只代表公开样例匹配，不代表隐藏测试点全部通过，仍需点击“提交代码”完成正式评测。

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
- 考试答题页使用锁定布局，隐藏全站导航、退出和返回链接；离开考试路由、后退、刷新或关闭页面会直接调用幂等交卷接口，同场切题不交卷。
- 切换浏览器标签、最小化窗口或切换其他软件不会触发交卷。
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
- 教师学情看板
- 系统设置功能卡片

管理员首页公告读取系统设置中的 `adminNotice`。

### 教师学情看板与专项练习

页面：

```text
/admin/learning
/admin/learning/[studentId]
```

- 支持近 7 天、近 30 天和全部历史三个分析周期，只分析编程题，日常与考试提交都会纳入。
- 规则诊断识别近期未训练、持续卡题、编译基础、逻辑判断、运行稳定性和效率问题；累计历史用于判断题目是否曾经通过以及是否仍待攻克。
- 学生详情页集中展示主要问题、持续卡题、最近失败、AI 学情摘要和推荐练习题，不再单独展示分类掌握率、错误状态分布或题库缺口。
- 推荐从最薄弱的两个分类轮流选择待攻克题和从未尝试题，排除历史 AC、客观题及其他未完成任务中的重复题。
- 教师可以搜索、增删和排序 1–10 道编程题后下发；下发后题目集合锁定，标题、说明和截止日期仍可修改。进行中任务需先归档，归档后可永久删除。
- AI 教师摘要只接收聚合统计，按学生和周期保存缓存；DeepSeek 失败不影响规则诊断、推荐和任务下发。

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
- 单个下架题目。
- 批量选择题目。
- 全选当前页。
- 批量下架题目。
- 下架前二次确认。
- 下架成功后刷新列表并清空选中状态。
- 分页或筛选变化后清空选中状态，避免误删。
- 新增和编辑题目时维护测试点。
- 新增和编辑题目时至少需要两组样例测试点。
- 题目分类会影响学生端和管理员端的分类筛选。
- 题目列表中的提交数量统计日常刷题总提交次数，点击数字会跳转到按该题筛选后的 `/admin/submissions?problemId=题目ID`。

批量下架接口：

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
- 为学生单独开通或关闭 AI 对话权限，默认关闭。
- 重置密码。
- 删除用户。
- 删除前二次确认。
- 不能删除当前登录账号。
- 密码使用 `passwordHash` 保存，不明文存储。

### AI 使用与对话审阅

页面：

```text
/admin/ai-usage
/admin/ai-usage/[studentId]
```

- 按今天、近 7 天、近 30 天、全部或自定义日期查看学生 AI 使用、真实模型调用、缓存、失败和 Token。
- 今日视图提供北京时间 24 小时分布；总览会保留未使用过 AI 的学生。
- 学生明细按题目和对话展示学生可见提问、清洗后的最终回复、状态、耗时、模型和 Token。
- 只记录功能上线后的新请求；学生清空本地面板不会删除教师端历史。
- 不保存学生代码、客户端历史副本、完整 Prompt、隐藏测试点、完整错误日志或 `reasoning_content`。

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
- 浏览器标签名称 `browserTitle`
- 浏览器标签图标 `browserIcon`
- 学生端公告 `studentNotice`
- 管理员端公告 `adminNotice`
- 默认 C++ 代码模板 `defaultCppTemplate`
- 默认评测时间限制 `defaultTimeLimitMs`
- 默认评测内存限制 `defaultMemoryLimitMb`
- 日常练习 AI 助手开关 `aiPracticeEnabled`
- AI 对话记录保留时间 `aiConversationRetentionDays`（30、90、180、365 天或永久，默认 180 天）
- 是否允许学生自助注册 `allowStudentRegister`

说明：

- 当前暂未开放学生自助注册页，`allowStudentRegister` 是预留开关。
- 登录页、学生端布局、管理员端布局和首页公告会读取系统设置。
- 浏览器标签名称留空时使用平台名称；标签图标支持 PNG、ICO，最大 256KB，可恢复为浏览器默认图标。
- 标签图标以受校验的图片数据保存在 `SystemSetting`，不会因代码发布或目录切换丢失；保存设置后当前标签页立即更新，其他页面刷新后生效。
- 默认 C++ 模板已接入 Monaco Editor。
- 默认评测时间和内存已接入提交接口。
- 日常练习 AI 关闭时，学生日常刷题页不显示 AI 按钮，服务端接口也会拒绝请求。
- 日常练习 AI 总开关不会绕过个人权限；学生个人 AI 权限关闭时同样不显示，接口返回 403。
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
- 一次选择最多 20 个 Markdown 文档，并逐文件解析、预览和报错。
- 同一批文档可以混合编程题与选择判断题，每道题按自身题型、难度和分类显示标签并入库。
- 未声明 `## 题型`、但包含 `## 客观题` 的文档会自动识别为选择判断题。
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

一个或多个 Markdown 文件均可批量导入；每个文件可以包含一道或多道题，每道题以一级标题 `#` 开始。

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

- 一次最多选择 20 个 `.md` 文档，每个文档最大 1MB，文档内容合计最大 8MB。
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

试运行使用独立的 `runCppCode` 接口：样例模式比较公开样例，自定义模式只执行程序；两者复用同一套编译执行层和安全限制，正式 `judgeCppCode` 的返回结构保持不变。

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
- 日常提交、考试提交、样例运行和自定义运行都走同一个队列。
- 正式提交是高优先级，能够排在尚未开始的试运行之前，但不会强行中断正在执行的任务。
- 每个账号同时只能占用一个试运行请求，试运行结束后服务端强制冷却 5 秒。
- 一个任务失败不会卡住后续任务。
- 当前是 Demo 级内存队列，服务重启后等待中的任务会丢失。
- 正式多实例部署建议替换为 Redis、消息队列或独立评测服务。

## 数据库模型

核心表：

- `User`：用户账号，包含 `student` 和 `admin` 两种角色；`sessionVersion` 用于废除学生旧会话，学生只保留最后一次登录，管理员保持多设备登录。
- `StudentProfile`：学生扩展档案，保存管理员自定义头衔和个人 AI 权限；积分和段位实时从提交记录计算，不写入该表。
- `Problem`：题目主体信息，包含标题、描述、难度、分类和第一组样例。
- `Problem.problemType`：`programming` 或 `objective`；客观题小题 JSON 保存于 `objectiveItems`。
- `TestCase`：测试点，包含样例测试点和隐藏测试点。
- `Submission`：提交记录，保存整体评测结果、提交代码、语言、`submissionType`、可选 `examId` 和可选 `learningAssignmentId`。
- `SubmissionCaseResult`：单个测试点评测结果。
- `Exam`：模拟考试。
- `Exam.examType`：限制整场考试只能包含同类型题目。
- `ExamProblem`：考试和题目的关联，包含题目顺序和分值。
- `ExamRecord`：学生参加某场考试的记录，包含开始时间、交卷时间、状态和总分。
- `LearningAssignment`：教师下发给学生的专项练习，保存标题、说明、截止日期和归档状态。
- `LearningAssignmentProblem`：专项练习题目及顺序、题目信息快照和 `completedAt`。
- `LearningInsightSnapshot`：按学生和分析周期缓存 AI 教师摘要及聚合统计哈希。
- `AiConversation`：学生在一道题中的一次 AI 对话，保存学生、日常/考试范围和题目/考试标题快照。
- `AiConversationTurn`：AI 对话回合，保存可见问答、处理状态、响应时长、真实模型调用次数及 API 返回的 Token 数据；不保存代码或内部推理。
- `SystemSetting`：系统设置，按 key-value 保存站点配置。

提交类型：

```text
submissionType = practice    日常刷题提交
submissionType = exam        模拟考试提交
```

`Submission.examId` 只用于关联具体考试，不再作为判断提交类型的唯一依据。这样即使考试被删除导致 `examId` 变为 `null`，考试提交也不会混入日常提交记录。

重要关系：

- 管理员移除题目时写入 `Problem.archivedAt`，不物理删除题目、测试点或提交；历史 Accepted 继续参与天梯积分。
- 下架题目不会出现在日常题库、组卷、专项推荐、提交、试运行和 AI 入口。
- 删除提交会级联删除测试点结果。
- 删除考试会级联删除考试题目关联和考试记录。
- `Submission.examId` 对 `Exam` 是 `ON DELETE SET NULL`。
- 删除专项练习会级联删除任务题目和完成进度；关联提交的 `learningAssignmentId` 会置空，提交记录本身保留。

## 数据库迁移与备份

### 本地重置

本地开发需要清空并重建数据库时可以运行：

```bash
npm run db:init
npm run seed
```

再次提醒：`db:init` 会执行破坏式 `prisma/init.sql`，生产环境禁止运行。

### Prisma Migrate

当前迁移目录按顺序包含：

```text
0001_initial
0002_objective_problem_type
0003_student_profile
0004_ai_assist
0005_ai_student_access
0006_learning_dashboard_assignments
0007_problem_archiving
0008_student_single_session
0009_ai_usage_audit
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

当前固定小班、低并发教学可以继续使用 SQLite，但必须定期备份。

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
/student/review
/student/assignments
/student/assignments/[id]
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
/admin/learning
/admin/learning/[studentId]
/admin/ai-usage
/admin/ai-usage/[studentId]
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

学生登录会原子递增 `sessionVersion`，新登录设备会使旧学生会话失效；管理员登录不递增版本。学生登录前若仍有 `in_progress` 考试，服务端会先按幂等交卷流程结算。`GET /api/auth/me` 对被替换或旧版学生会话返回 401，并通过 `reason` 区分 `session_replaced`、`session_invalid` 等原因。

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
POST /api/problems/[id]/run
POST /api/problems/[id]/submit
GET  /api/submissions/my
GET  /api/submissions/[id]
POST /api/ai/problem-assist

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

POST   /api/admin/learning/insight
POST   /api/admin/learning/assignments
PATCH  /api/admin/learning/assignments/[id]
DELETE /api/admin/learning/assignments/[id]

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

管理员用户接口支持 `customTitle` 和 `aiAccessEnabled` 字段：创建或编辑学生时可设置最多 20 字的自定义头衔，并可单独开通 AI 对话权限；个人 AI 权限默认关闭。

`POST /api/problems/[id]/run` 接收 `code`、`mode = samples|custom`、可选 `customInput` 和学生考试使用的可选 `examId`。代码上限 128KB，自定义输入上限 32KB；接口只支持编程题，不接受 `learningAssignmentId`，样例输入和标准输出只能由服务端读取。参数错误、未登录、考试不可用、内容过大、频率过高和 Judge 不可用分别使用 400、401、403、413、429、503。

专项练习删除接口只接受已归档任务；进行中的任务返回冲突错误，必须先归档。永久删除会清除任务题目与进度，但不会删除学生原有提交。

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

学生 `GET /api/problems` 的每个题目项包含 `isAccepted`，按该学生全部历史 `Accepted` 实时计算；日常和考试 AC 均计入，后续失败不会清除“已通过”标记。

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
[ ] 运行样例和自定义输入冒烟测试通过，且未新增 Submission
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
- 当前账号体系使用签名 Cookie 和数据库会话版本；学生新登录会替换旧会话，管理员仍可多设备登录。系统已具备登录失败限流、会话有效期和同源变更请求校验，但还没有验证码、找回密码、操作审计和多因素认证等完整账号安全能力。
- SQLite 适合 Demo，不适合高并发正式场景。
- 提交详情会展示所有测试点输入输出，正式 OJ 通常需要隐藏非样例测试点。

工程限制：

- 当前同时维护 Prisma Migrate、`prisma/schema.prisma` 和首次安装使用的 `prisma/init.sql`；结构变更必须让三者保持同步。
- 内存提交队列不适合多实例部署。
- 自动化测试已覆盖核心计算、主要 API、权限边界、AI、学情和试运行队列，但完整浏览器端到端权限与考试流程仍需补强。

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

- 为 Prisma migration、schema 和 `init.sql` 增加自动一致性检查。
- 补充端到端测试。
- 补充接口权限测试。
- 增加操作审计日志。

第 5 阶段：题库增强

- 题目标签系统。
- 隐藏测试点导入。
- 题目难度统计。
- 批量编辑题目分类和难度。

## 当前版本结论

当前版本已经适合作为本地 Demo、课堂演示、内部功能验证，以及固定小班、低并发的正式教学使用。

当前版本不建议直接扩展为大规模公网 OJ 或高并发竞赛平台。真实使用时必须保持 `JUDGE_MODE=docker`、定期备份 SQLite、关闭公网 3000 端口，并避免重复执行 `npm run seed` / `npm run db:init`。

如果要扩大使用规模，最低需要继续完成：

- 将 SQLite 迁移到 PostgreSQL。
- 将内存队列升级为 Redis / BullMQ 或独立 Judge 服务。
- 隐藏非样例测试点输入输出。
- 补充端到端权限测试和真实 Docker Judge 冒烟测试脚本。
- 配置域名、HTTPS、自动备份和更完整的监控告警。
- 为考试结果和成绩统计补充更完整的管理视图。
