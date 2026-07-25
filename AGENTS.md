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

只有无法本地生成 Linux standalone 时，才按 `docs/deploy.md` 在服务器备份数据库、停 PM2，并用 `NEXT_PRIVATE_BUILD_WORKER_COUNT=1`、`NODE_OPTIONS='--max-old-space-size=768'` 构建；重启后必须检查 `/api/health`。

## 编辑器策略

- `src/components/CodeEditor.tsx` 是全站共用 Monaco 编辑器。自动代码提示、单词建议、Tab 补全、参数提示和内联建议默认关闭；不要在未明确要求时重新开启。
- 编辑器字号调节也集中在 `src/components/CodeEditor.tsx`，会写入浏览器 `localStorage`，不要为单个页面重复实现。

## 提交反馈策略

- AC 透明动效集中在 `ProblemSubmitForm.tsx` 和真实 alpha 图片 `public/ac-success.png`；遮罩必须 portal 到 `document.body`，否则祖先残留的 `transform` 会让 `position: fixed` 在自动滚动后偏离视口中心。

## 试运行规则

- `POST /api/problems/[id]/run` 只用于编程题的公开样例和自定义输入，不得创建 `Submission`，也不得影响积分、错题本、考试成绩或专项练习进度。
- 样例模式只能由服务端读取 `TestCase.isSample = true` 或旧版公开样例字段；禁止接收客户端提供的样例标准答案，禁止读取或返回隐藏测试点。
- 自定义输入只展示实际输出和运行错误，不产生 Accepted、Wrong Answer 或标准答案判断。
- 试运行和正式提交必须共用 Judge 队列；正式提交优先于尚未开始的试运行，但不要中断正在执行的任务。
- 服务端必须保持每账号一个试运行任务和结束后 5 秒冷却，不能只靠前端禁用按钮。
- 学生考试试运行必须验证考试已发布、题目归属、学生已开始且未交卷/超时；管理员校题不创建 `ExamRecord`。

## 浏览器标签设置

- 标签名称与图标保存在 `SystemSetting.browserTitle`、`browserIcon`，空标题回退 `siteName`；图标仅接受服务端校验的 256KB 内 PNG/ICO Data URL。全站只通过 `BrowserIdentity.tsx` 同步，禁止单页重复修改标题、favicon 或改用随发布目录丢失的上传文件。

## 头衔与天梯规则

- 学生段位积分实时从 `Submission` 计算，不要新增积分缓存表；规则为唯一 Accepted 题数 × 10。
- 同一用户同一题多次 `Accepted` 只计入 1 道唯一 AC 题；日常刷题和考试提交都计入统计。
- 管理员或老师设置的自定义头衔和学生个人 AI 权限分别保存在 `StudentProfile.customTitle`、`StudentProfile.aiAccessEnabled`；头衔只覆盖展示文案，不影响积分、自动段位和排名。
- 天梯排序固定为：积分降序 → 唯一 AC 题数降序 → AC 总次数降序 → 用户名升序 → 用户 ID 升序。
- 管理员移除题目必须写入 `Problem.archivedAt` 做下架，禁止物理删除 `Problem`；下架题目不再出现在题库、组卷、专项推荐、提交、试运行或 AI 入口，但历史 `Submission` 必须保留用于积分和排名。

## 老师端权限边界

- `User.role` 只允许 `student`、`teacher`、`admin`；老师登录后进入独立 `/teacher`，直接访问 `/admin` 页面应重定向到老师首页。
- 管理员可以管理全部角色；老师用户接口只能枚举、创建、改密、调整头衔和 AI 权限或删除学生，禁止读取和维护老师或管理员。
- 用户密码只能保存不可逆哈希，任何用户查询不得返回 `passwordHash`。编辑账号时不能展示原密码；新建或重置密码必须在前端二次确认且至少 8 位，确认值不得发送到接口或数据库。
- 老师不能访问系统设置、AI 服务商与模型配置、题目管理、题目导入、上下架、题序或分类排序；隐藏菜单不能替代 API 的管理员鉴权。
- `Exam.createdById` 保存考试创建者。管理员可管理全部考试；老师的考试列表、详情、编辑、组卷、发布、练习、记录和删除必须同时校验 `createdById`，他人考试统一返回 404。
- 历史 `createdById = null` 的考试仅管理员可管理；删除老师或把老师改成学生时清空其考试归属并保留考试。
- 管理员和老师考试列表必须显示创建人/归属账号标签；`createdById = null` 或账号已删除时显示“出卷人：未记录”，不要误称为最后发布人。
- 老师可以查看全部学生学情，但只能修改、归档和删除自己创建的 `LearningAssignment`；其他老师任务仅查看，写接口统一返回 404。
- 老师可以查看全部学生提交和自己的校题提交；不得泄露其他老师或管理员的校题代码。
- 老师和管理员允许多设备登录；修改密码或角色仍须递增 `sessionVersion` 废除旧会话。

## AI 助手规则

- AI 密钥分别使用 `DEEPSEEK_API_KEY`、`ARK_API_KEY`、`AI_CUSTOM_API_KEY`，只能保存在本地或生产 `.env`；不得进入 `SystemSetting`、前端、Git、日志、测试快照或文档示例。
- 管理员只在系统设置中保存非敏感的服务商、Base URL、模型和思考模式；学生助手与教师学情摘要统一跟随，学生端不得出现调整入口。
- DeepSeek 与豆包使用固定官方 Base URL；自定义 OpenAI-compatible 服务在生产环境只允许公共 HTTPS，必须执行 DNS 全量校验和固定、阻止私网/保留网络与重定向，模型列表响应上限 1MB、超时 15 秒。
- AI 请求必须走服务端 API；浏览器不得直接调用任何上游模型服务。管理员模型发现接口同样不得返回密钥、请求头或上游响应正文。
- AI 只对编程题开放，并采用个人权限加日常/考试总开关的双重校验；服务端统一执行 20 秒冷却，选择判断题不得显示入口。
- 学生端仅在 `localStorage` 保留最近 20 条消息，请求最多携带 12 条；服务端只审计学生实际可见问答、清洗后回复和调用统计，严禁保存代码快照、完整 Prompt、隐藏测试点、完整错误、内部推理、密钥或请求头。
- AI 审计默认保留 180 天，可配置为 30、90、180、365 天或永久；`requestId` 必须幂等，缓存命中计使用次数但模型调用和 Token 为 0。
- 同一学生在所有题目、考试和 AI 模式中共用服务端 20 秒冷却；只有不含个人代码和对话的 `overview` 可使用同题 5 分钟缓存，缓存键必须包含非敏感服务商配置指纹，缓存命中也不能绕过冷却。
- AI 输出不得包含完整代码、可复制代码语句、最终答案或隐藏测试点；代码检查最多指出三个问题及所在行。SSE 只能在完整清洗后分片展示安全文本，禁止透传上游 token，并保留旧 JSON 客户端兼容。

## 学情看板与专项练习规则

- 学情诊断只分析编程题提交，日常和考试都纳入；分析周期为 `7d`、`30d`、`all`。
- 教师 AI 摘要只能接收聚合统计，不得发送学生源码、AI 对话、隐藏测试点或完整错误日志；AI 失败不得阻断规则诊断和任务下发。服务商配置指纹必须进入摘要缓存哈希，切换模型或思考模式后旧摘要自动过期。
- 教师学情详情页只展示主要问题、持续卡题、最近失败、AI 摘要和推荐练习题；不要恢复分类掌握率、错误状态分布或题库缺口模块，除非用户重新明确要求。
- 专项练习每份 1–10 道编程题；未归档任务可由管理员或任务创建老师统一保存题目增删、顺序、标题、说明和截止日期。保留的任务题必须保留快照与 `completedAt`，新增题创建新快照且不得继承历史 AC。
- 移除已完成题必须强提醒，只清空相关提交的 `learningAssignmentId` 并重新计算进度，禁止删除历史提交或代码。进行中任务禁止硬删除，归档后才可由管理员或任务创建老师永久删除。
- 同一道题不能同时存在于同一学生两份未完成任务中。
- 只有携带合法 `learningAssignmentId` 的日常 `Accepted` 才更新 `completedAt`；普通日常、考试和历史 AC 均不计入专项进度。Judge 完成写库前必须重新确认任务题仍有效；若评测期间被移除，本次提交保存为普通练习并向页面返回明确说明。

## 题型与考试规则

- 学生账号使用 `User.sessionVersion` 保证只保留最后一次登录会话；老师和管理员允许多设备登录。修改密码或角色必须递增会话版本。
- 学生新设备登录前必须先结算该学生所有 `in_progress` 考试；旧设备 API 返回 401，并在页面聚焦或每 30 秒检查时退出。
- 学生考试答题页必须使用锁定布局；离开考试路由、后退、刷新、关闭页面或退出账号调用现有幂等交卷接口，同场切题和切换浏览器标签不交卷。
- 日常题库的“已通过”实时读取该学生全部历史 `Accepted`，日常和考试、编程和客观题都计入；不得因后续失败取消标记。
- 题库自定义题序保存在 `Problem.sortOrder`，分类标签顺序保存在 `ProblemCategoryOrder`；只有管理员题目管理页可以拖动或上下调整顺序。标题/时间查看排序默认只预览，但管理员可以把当前题型或分类的全部结果保存为一次性自定义题序快照；学生题库、管理员与老师练习、组卷搜索只读跟随保存后的顺序，不得向学生或老师开放排序入口。

- `Problem.problemType` 和 `Exam.examType` 只允许 `programming`、`objective`。
- 一场考试只能包含与 `Exam.examType` 相同的题目，题目搜索、Markdown 导入、添加题目和发布接口都必须校验。
- 客观题标准答案保存在 `Problem.objectiveItems`，学生题目接口和考试答题接口不得返回 `answer` 字段。
- 管理员和老师的题目练习页、考试练习页用于校题，可以展示客观题标准答案；学生端不得展示。
- 后台校题的“已通过”按当前管理员或老师账号全部历史 `Accepted` 实时计算，后续失败不得取消；题目练习列表、题目详情和考试练习题单必须统一显示，并链接到当前账号最近一次 Accepted 的提交详情。
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

深入说明与当前操作手册索引见 `README.md`。
