# OJ 项目协作规则

## 项目概览

这是一个 Next.js App Router + Prisma + SQLite 的 C++ 在线 OJ。线上服务位于 `/www/oj`，PM2 进程名为 `oj`，健康检查为 `/api/health`，Judge 使用 Docker。

## 数据安全红线

- 生产数据库为 `/www/oj/prisma/prod.db`。
- 生产 `.env` 的 `DATABASE_URL` 必须是 `file:/www/oj/prisma/prod.db` 这种绝对 SQLite 路径；禁止使用 `file:./prod.db`，standalone 会解析到错误目录。
- 常规代码发布前必须先备份生产数据库到 `/www/backups`，并确认备份文件存在。
- 常规发布禁止执行 `npm run seed` 或 `npm run db:init`。
- 不要提交 `.env`、数据库文件、备份文件、`.next`、`node_modules` 或压缩包。
- 删除旧备份前，先确认要保留的最新备份路径真实存在。

## 低内存服务器发布

线上服务器为 2 核 CPU、2GB 内存、4GB swap。即使只修改一个页面，Next.js 仍会全量构建。常规发布优先在本地 Linux/Docker 环境生成 Next.js standalone 产物并上传，不要把 Windows 本机 `.next/standalone` 当作 Ubuntu 服务器产物。

发布包必须排除任何层级的 `.env`（包括可能被 Next 追踪进 `.next/standalone/.env` 的副本）、数据库文件、备份文件、`.next/cache` 和压缩包；服务器继续使用 `/www/oj/.env` 和 `/www/oj/prisma/prod.db`。Next standalone 包必须把 `.next/static` 复制到 `.next/standalone/.next/static`，把 `public` 复制到 `.next/standalone/public`，否则页面会无样式且无前端交互。`npm run start` 通过 `scripts/load-env.mjs` 预加载 `.env` 后启动 `.next/standalone/server.js`，不要改成裸跑 `node .next/standalone/server.js`。

本地 Linux 构建容器要先安装与生产机一致的 OpenSSL；当前生产机使用 OpenSSL 3，发布前必须确认 standalone 内 Prisma 引擎为 `libquery_engine-debian-openssl-3.0.x.so.node`，不能使用构建警告后回退生成的 OpenSSL 1.1 引擎。

构建容器若加载了 `NODE_ENV=production`，安装构建依赖必须使用 `npm ci --include=dev`，否则 Tailwind、TypeScript 等构建期依赖会被省略；发布包上传前必须按归档条目再次检查所有层级的 `.env` 和数据库文件，不能只检查仓库根目录。

2GB 服务器上常规发布也不要执行 `npm ci`。依赖未变时复用当前 `/www/oj/node_modules`；依赖变更时应在本地 Linux/Docker 环境生成可用于 Ubuntu 的根 `node_modules` 并随包上传，或安排维护窗口停 PM2 后再处理。切换前不要在 `/www/oj-new` 直接执行 `npm run db:deploy`，因为生产 `.env` 使用绝对 `DATABASE_URL=file:/www/oj/prisma/prod.db`，会迁移旧目录数据库；应停 PM2、备份并复制最新 DB、切换目录后在新的 `/www/oj` 执行迁移。

## 服务器磁盘清理边界

- 常规清理只允许动 OJ 明确路径：`/www/oj-old-*`、失败发布残留的 `/www/oj-new`、OJ 发布压缩包 `/www/oj-release.tgz` 或历史 `/www/oj.zip`。
- 清理前先确认当前 `/www/oj` 存在、PM2 进程 `oj` 在线、`/api/health` 正常；清理后再次检查健康状态。
- 不要为了 OJ 清理去删除其它站点目录、股票系统目录，或 `stock-fund-advisor*` Docker 容器/镜像。
- `docker system df` 只读可用；`docker system prune`、`docker builder prune` 属于全局清理，可能影响股票系统构建缓存，除非用户明确确认，否则不要执行。

只有无法本地生成 Linux standalone 产物时，才在服务器停 PM2 后使用单 worker 低内存构建：

```bash
cd /www/oj
mkdir -p /www/backups
cp /www/oj/prisma/prod.db /www/backups/prod-$(date +%Y%m%d-%H%M%S).db
pm2 stop oj
NEXT_TELEMETRY_DISABLED=1 NEXT_PRIVATE_BUILD_WORKER_COUNT=1 NODE_OPTIONS='--max-old-space-size=768' npm run build
pm2 restart oj --update-env
curl http://127.0.0.1:3000/api/health
```

构建日志应包含：

```text
Collecting page data using 1 worker
Generating static pages using 1 worker
```

## 编辑器策略

- `src/components/CodeEditor.tsx` 是全站共用 Monaco 编辑器。自动代码提示、单词建议、Tab 补全、参数提示和内联建议默认关闭；不要在未明确要求时重新开启。
- 编辑器字号调节也集中在 `src/components/CodeEditor.tsx`，会写入浏览器 `localStorage`，不要为单个页面重复实现。

## 提交反馈策略

- AC 透明动效弹窗集中在 `src/components/ProblemSubmitForm.tsx` 和 `public/ac-success.png`。图片必须保持真实 alpha 透明背景，不要替换成带棋盘格像素的伪透明图。
- AC 遮罩必须通过 portal 挂到 `document.body`。页面入场动画会让 `.app-stage` 等祖先保留 `transform`，若把 `position: fixed` 遮罩留在题目内容树内，它会改为相对该祖先定位，并在提交结果自动滚动后偏离当前视口中心。

## 试运行规则

- `POST /api/problems/[id]/run` 只用于编程题的公开样例和自定义输入，不得创建 `Submission`，也不得影响积分、错题本、考试成绩或专项练习进度。
- 样例模式只能由服务端读取 `TestCase.isSample = true` 或旧版公开样例字段；禁止接收客户端提供的样例标准答案，禁止读取或返回隐藏测试点。
- 自定义输入只展示实际输出和运行错误，不产生 Accepted、Wrong Answer 或标准答案判断。
- 试运行和正式提交必须共用 Judge 队列；正式提交优先于尚未开始的试运行，但不要中断正在执行的任务。
- 服务端必须保持每账号一个试运行任务和结束后 5 秒冷却，不能只靠前端禁用按钮。
- 学生考试试运行必须验证考试已发布、题目归属、学生已开始且未交卷/超时；管理员校题不创建 `ExamRecord`。

## 浏览器标签设置

- 浏览器标签名称和图标保存在 `SystemSetting.browserTitle`、`SystemSetting.browserIcon`；标题留空时回退到 `siteName`。
- 标签图标只允许经过服务端校验的 PNG、ICO Data URL，原文件最大 256KB；不要改成发布目录内的可变上传文件，否则目录切换会丢失。
- 全站标签同步集中在 `src/components/BrowserIdentity.tsx`，管理员保存后通过同一组件即时应用，不要在单个页面重复修改 `document.title` 或 favicon。

## 头衔与天梯规则

- 学生段位积分实时从 `Submission` 计算，不要新增积分缓存表；规则为唯一 Accepted 题数 × 10。
- 同一用户同一题多次 `Accepted` 只计入 1 道唯一 AC 题；日常刷题和考试提交都计入统计。
- 管理员自定义头衔和学生个人 AI 权限分别保存在 `StudentProfile.customTitle`、`StudentProfile.aiAccessEnabled`；头衔只覆盖展示文案，不影响积分、自动段位和排名。
- 天梯排序固定为：积分降序 → 唯一 AC 题数降序 → AC 总次数降序 → 用户名升序 → 用户 ID 升序。
- 管理员移除题目必须写入 `Problem.archivedAt` 做下架，禁止物理删除 `Problem`；下架题目不再出现在题库、组卷、专项推荐、提交、试运行或 AI 入口，但历史 `Submission` 必须保留用于积分和排名。

## AI 助手规则

- DeepSeek API Key 只能保存在本地或生产 `.env`，不得进入前端、Git、日志、测试快照或文档示例。
- AI 请求必须走服务端 API；浏览器不得直接调用 DeepSeek。
- 学生 AI 使用频率必须由服务端强制限制，当前为每次使用后至少等待 20 秒。
- AI 提示不得返回完整可提交代码；服务端要保留输出拦截。
- AI 只对编程题开放；选择判断题默认不显示 AI，避免泄露答案。
- AI 采用双重权限：`StudentProfile.aiAccessEnabled` 必须开启，并且日常练习的 `SystemSetting.aiPracticeEnabled` 或当前考试的 `Exam.aiEnabled` 也必须开启；个人权限默认关闭。
- 学生端仍只在浏览器 `localStorage` 保留最近 20 条消息，请求只带最近 12 条；服务端通过 `AiConversation`、`AiConversationTurn` 保存学生实际可见的提问、清洗后回复和调用统计，供管理员审阅。
- AI 审计记录严禁保存学生代码快照、客户端历史副本、完整 Prompt、隐藏测试点、完整错误日志、`reasoning_content`、API Key 或请求头；学生清空本地面板不得删除教师端历史。
- AI 审计默认保留 180 天，管理员只能选择 30、90、180、365 天或永久；同一 `requestId` 必须幂等，缓存命中计学生使用但模型调用和 Token 为 0。
- 同一学生在所有题目、考试和 AI 模式中共用服务端 20 秒冷却；只有不含个人代码和对话的 `overview` 可使用同题 5 分钟缓存，缓存命中也不能绕过冷却。
- AI 输出不得包含完整代码、可复制代码语句、最终答案或隐藏测试点；代码检查最多指出三个问题及所在行。
- 学生端 AI 使用 SSE：等待期间每 2 秒发送思考状态，最终回复必须先完整通过输出清洗，再按安全文本片段流式展示；禁止直接转发未经检查的 DeepSeek 原始 token。旧客户端 JSON 响应必须继续兼容。

## 学情看板与专项练习规则

- 学情诊断只分析编程题提交，日常和考试都纳入；分析周期为 `7d`、`30d`、`all`。
- DeepSeek 教师摘要只能接收聚合统计，不得发送学生源码、AI 对话、隐藏测试点或完整错误日志；AI 失败不得阻断规则诊断和任务下发。
- 教师学情详情页只展示主要问题、持续卡题、最近失败、AI 摘要和推荐练习题；不要恢复分类掌握率、错误状态分布或题库缺口模块，除非用户重新明确要求。
- 专项练习每份 1–10 道编程题；下发后题目集合不可修改，只能调整标题、说明、截止日期或归档。进行中任务禁止硬删除，归档后才可由管理员永久删除。
- 同一道题不能同时存在于同一学生两份未完成任务中。
- 只有携带合法 `learningAssignmentId` 的日常 `Accepted` 才更新 `completedAt`；普通日常、考试和历史 AC 均不计入专项进度。

## 题型与考试规则

- 学生账号使用 `User.sessionVersion` 保证只保留最后一次登录会话；管理员允许多设备登录。修改密码或角色必须递增会话版本。
- 学生新设备登录前必须先结算该学生所有 `in_progress` 考试；旧设备 API 返回 401，并在页面聚焦或每 30 秒检查时退出。
- 学生考试答题页必须使用锁定布局；离开考试路由、后退、刷新、关闭页面或退出账号调用现有幂等交卷接口，同场切题和切换浏览器标签不交卷。
- 日常题库的“已通过”实时读取该学生全部历史 `Accepted`，日常和考试、编程和客观题都计入；不得因后续失败取消标记。
- 题库自定义题序保存在 `Problem.sortOrder`，分类标签顺序保存在 `ProblemCategoryOrder`；只有管理员题目管理页可以拖动或上下调整顺序。标题/时间查看排序默认只预览，但管理员可以把当前题型或分类的全部结果保存为一次性自定义题序快照；学生题库、管理员练习和组卷搜索只读跟随保存后的顺序，不得向学生开放排序入口。

- `Problem.problemType` 和 `Exam.examType` 只允许 `programming`、`objective`。
- 一场考试只能包含与 `Exam.examType` 相同的题目，题目搜索、Markdown 导入、添加题目和发布接口都必须校验。
- 客观题标准答案保存在 `Problem.objectiveItems`，学生题目接口和考试答题接口不得返回 `answer` 字段。
- 管理员题目练习页和管理员考试练习页用于校题，可以展示客观题标准答案；学生端不得展示。
- 客观题提交不进入 Docker Judge；每行对应一道小题，逐题结果写入 `SubmissionCaseResult`，考试分数取单次提交的最高小题分值合计。
- 客观题小题分值必须是正整数，`ExamProblem.score` 使用小题分值总和。
- 客观题 Markdown 导入选项必须是单行 `A. 选项内容`；题干可用代码块，选项内代码或输出用行内代码，不要支持或生成 `A.` 后接代码块的格式。
- 题面与导入预览的 Markdown/KaTeX 渲染集中在 `src/components/ProblemRichText.tsx`，编程题和客观题必须复用；递归解析行内内容时，每次调用都要新建带 `g` 标志的正则，禁止共享会改变 `lastIndex` 的模块级正则。
- 单大题选择判断考试和管理员考试练习页隐藏左侧“考试题目”导航以扩大题面；同场多题时必须保留导航。
- 选择判断考试通过“提交答案”二次确认后交卷，提示文案不要写死“右侧”，避免布局变化后失真。

## 本地质量检查

```bash
npm run test
npx tsc --noEmit
npm run lint
npm run build
```

## 深入文档

| 文档 | 用途 |
| --- | --- |
| `README.md` | 功能概览、本地开发和上线检查清单 |
| `docs/deploy.md` | 线上部署、更新、备份和容量建议 |
| `docs/admin-guide.md` | 管理员使用和运维手册 |
| `docs/student-guide.md` | 学生使用说明 |
| `docs/ops-review-2026-05-29.md` | 低内存构建事故和后续发布记录 |
| `docs/ops-review-2026-05-31.md` | 学生复制题面和管理员考试练习模式发布记录 |
| `docs/ops-review-2026-06-07.md` | Monaco 代码提示关闭发布记录 |
| `docs/ops-review-2026-06-13.md` | 编辑器字号调节和 AC 透明弹窗发布记录 |
| `docs/ops-review-2026-06-28.md` | 选择判断题型和本地 Linux standalone 发布记录 |
| `docs/ops-review-2026-06-29.md` | OJ 旧版本目录磁盘清理记录 |
| `docs/ops-review-2026-07-01.md` | 头衔天梯与安全加固上线记录 |
| `docs/ops-review-2026-07-02.md` | AI 思路上线与低内存发布事故修正记录 |
| `docs/ops-review-2026-07-10.md` | 生产运行时、Nginx、Judge 和权限加固记录 |
| `docs/ops-review-2026-07-11.md` | 竞技学院视觉与天梯升级记录 |
| `docs/ops-review-2026-07-12.md` | 天梯前一名与第一名积分差上线记录 |
| `docs/ops-review-2026-07-15.md` | AI 分层辅导、学情看板、专项练习及浏览器标签配置上线记录 |
| `docs/ops-review-2026-07-16.md` | 运行样例、自定义输入与共享 Judge 队列上线记录 |
| `docs/ops-review-2026-07-21.md` | 多文档题目导入、题型分类稳定性和选择判断公式渲染上线记录 |
| `docs/ops-review-2026-07-22.md` | 管理员题目与分类自定义排序、拖动保存和迁移上线记录 |
