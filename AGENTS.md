# OJ 项目协作规则

## 项目速查

Next.js App Router + Prisma + SQLite 的 C++ 在线 OJ。生产目录 `/www/oj`，PM2 进程 `oj`，健康检查 `/api/health`，正式评测使用 Docker。

| 内容 | 权威文档 |
|---|---|
| 架构、数据模型、API、开发命令 | `README.md` |
| 生产发布、回滚、证书、故障排查 | `docs/deploy.md` |
| 学生、老师、管理员操作 | `docs/student-guide.md`、`docs/teacher-guide.md`、`docs/admin-guide.md` |
| 历史发布与事故证据 | `docs/ops-review-*.md` |

## 生产与数据红线

- 正式入口固定为 `https://botcode.work`；HTTP、HTTP IP 和 `www` 只做保留 URI 的 301。`https://IP` 证书不匹配属于预期。
- 生产 `.env` 必须有 `APP_ORIGIN=https://botcode.work`、`SESSION_COOKIE_SECURE=true`、`OJ_LISTEN_HOST=127.0.0.1`，并使用绝对 `DATABASE_URL=file:/www/oj/prisma/prod.db`；删除废弃的旧 IP 站点变量。
- 发布前先把 `/www/oj/prisma/prod.db` 备份到 `/www/backups` 并确认非空；常规发布禁止 `npm run seed`、`npm run db:init`。
- 不提交 `.env`、数据库、备份、`.next`、根 `node_modules`、发布压缩包或密钥；删旧备份前先确认保留备份真实存在。
- 2 核 2GB 生产机不承担常规 `npm ci` 或 Next 构建。用本地 Linux/Docker 生成 Ubuntu standalone；Windows `.next/standalone` 不能上传。
- Linux 构建需安装 OpenSSL 3；包内 Prisma 引擎必须是 `libquery_engine-debian-openssl-3.0.x.so.node`。若容器加载生产环境，使用 `npm ci --include=dev`。
- 发布包逐条目排除所有层级 `.env`、数据库、备份、`.next/cache` 和嵌套压缩包；把 `.next/static`、`public` 复制进 `.next/standalone`。启动必须走 `npm run start`，不得裸跑 standalone server。
- 依赖未变可复用服务器根 `node_modules`；依赖变化时上传 Linux 依赖或安排停机窗口。不要在 `/www/oj-new` 迁移绝对路径生产库；停 PM2、备份/复制最新 DB、切换目录后再在新 `/www/oj` 执行 `db:deploy`。
- 只有无法本地构建时才按 `docs/deploy.md` 停 PM2 并用单 worker、`--max-old-space-size=768` 应急构建。
- OJ 清理只允许 `/www/oj-old-*`、失败残留 `/www/oj-new` 和 OJ 发布包；前后检查当前目录、PM2 与健康接口。不得动其它站点、股票系统或未经确认执行 Docker 全局 prune。
- 域名/证书变更先备份 Nginx。大陆公网 HTTP 被阿里云 `Server: Beaver` 403 时停止 HTTP-01；DNS-01 仅用最小权限 RAM 凭据且不得写入项目、`.env` 或日志。
- 证书必须覆盖根域名与 `www`，续期 hook 先 `nginx -t` 再 reload。首次 HSTS 为 `86400`；稳定 7 天且 dry-run 通过后才升至 `15552000`，不启用子域或 preload。完整跳转、双网络 HTTPS、连续健康检查未通过前不得删旧证书或宣布完成。

## Judge、提交与可见性

- 生产只能使用 Docker Judge；保留无网络、内存/CPU/PID、capability、`no-new-privileges` 和只读根文件系统限制。运行阶段工作目录只读，编译阶段限制产物大小，超时清理必须等待完成。
- 学生编程提交响应必须由 `sanitizeSubmissionForStudent` 清空每个测试点的 `input` 与 `expectedOutput`，但保留学生自己的 `actualOutput`；管理员和有权老师继续读取完整数据。不要用前端隐藏或 `isSample` 判断替代服务端脱敏。
- `POST /api/problems/[id]/run` 只运行编程题公开样例或自定义输入，不创建 `Submission`，不影响积分、错题本、考试成绩或专项进度。样例输入/答案只由服务端读取，自定义输入不判 Accepted/WA。
- 试运行与正式提交共用队列；正式提交优先于未开始的试运行但不中断运行中任务。服务端限制每账号一个试运行和结束后 5 秒冷却。
- 学生考试试运行必须验证发布状态、题目归属、已开始且未交卷/超时；后台校题不创建 `ExamRecord`。
- 队列满、排队超时和 Docker/编译器基础设施故障返回带 `Retry-After` 的可重试 `503`；不得把基础设施故障保存为学生 Compile Error。
- `src/components/CodeEditor.tsx` 统一管理 Monaco。自动建议、单词建议、Tab 补全、参数提示和内联建议默认关闭；字号设置也只在此实现。
- AC 动效集中在 `ProblemSubmitForm.tsx` 与透明图 `public/ac-success.png`：模块级预加载并等待 `decode()`，遮罩 portal 到 `document.body`，失败/限时超时退回文字；图片必须直取 `/ac-success.png`，保留 `unoptimized`，禁止进入 `/_next/image`。

## 账号与后台权限

- `User.role` 只允许 `student`、`teacher`、`admin`。学生登录递增 `sessionVersion`，仅最后设备有效；新登录前结算其全部 `in_progress` 考试。老师和管理员允许多设备，但改密或改角色仍废除旧会话。
- 密码只存不可逆哈希，查询不得返回 `passwordHash`。管理员新建/改密至少 8 位并二次确认；老师创建或重置学生时由服务端固定使用 `12345678`。
- 删除或降级管理员必须在应用事务和 SQLite 触发器两层保证至少保留一个管理员；不要绕过 `LAST_ADMIN_REQUIRED`。
- 老师只可枚举/创建学生、分别调整两项学生 AI 权限、重置固定密码；禁止改用户名、角色、头衔或删除学生，也禁止读取/维护老师和管理员。
- 老师不能访问系统设置、AI 模型、题目管理/导入/上下架/排序；页面隐藏不能替代 API 管理员鉴权。
- `Exam.createdById` 决定老师考试所有权；老师对他人或空归属考试的列表、详情、编辑、组卷、发布、练习、记录和删除统一得到 404。管理员可管理全部；删除老师或将其降为学生时清空归属但保留考试。
- 老师可看全部学生学情，但只能修改、归档、删除自己创建的任务；他人任务写接口返回 404。老师可看全部学生提交和自己的校题提交，不得读取其他后台账号的校题代码。
- 管理员移除题目只写 `Problem.archivedAt`，不得物理删除；下架题不再进入题库、组卷、专项推荐、提交、试运行或 AI，历史提交和积分必须保留。

## AI 安全与幂等

- 密钥仅使用 `.env` 中的 `DEEPSEEK_API_KEY`、`ARK_API_KEY`、`AI_CUSTOM_API_KEY`；不得进入 `SystemSetting`、浏览器、Git、日志、测试快照或文档示例。
- 管理员只保存两套非敏感服务商/URL/模型/思考配置与五项教学提示词。提示词为 1–4000 字，只调表达，不得覆盖题面不可信边界、完整代码/隐藏测试保护、数据库答案或结构化输出规则，也不影响教师学情摘要。
- DeepSeek/豆包 Base URL 固定；生产自定义 OpenAI-compatible 只允许公共 HTTPS，执行 DNS 全量校验与固定，阻止私网/保留地址、凭据型 URL、重定向和超大响应。模型列表上限 1MB、超时 15 秒。
- 浏览器只能调用本站服务端 API，不得直连上游；模型发现也不得返回密钥、请求头或上游正文。AI 配置数据库读取失败必须 fail closed；仅成功读取到空配置时允许旧环境变量兜底。
- 学生编程 AI 同时校验个人权限和日常/考试开关。考试范围必须从服务端有效 `ExamRecord` 推导；客户端省略或伪造 `examId` 不能绕过本场开关。
- 学生选择判断 AI 另校验主开关、学生总开关、个人权限和当前大题的一次日常提交；只开放日常/专项。账号存在任意有效进行中正式考试时接口必须拒绝，考试页及结果页不得出现入口。
- 后台编程助手只受 `aiStaffProgrammingAssistEnabled` 控制并校验考试归属，不读取学生权限，不混入学生 AI 看板。
- 学生浏览器最多保留 20 条、请求携带 12 条。审计只存学生可见问答、清洗回复和统计；严禁代码快照、完整 Prompt、隐藏测试、完整错误、内部推理、密钥或请求头。
- `requestId` 重放必须匹配账号、题目、考试、scope、mode、AI profile 与客观题小题序号；冲突统一拒绝且不泄露原上下文。有效缓存/幂等重放计使用但模型调用和 Token 为 0。
- 冷却按账号、角色入口和题型隔离，范围 5–600 秒；只有真正开始上游调用时计时，上游失败仍计时，有效缓存和幂等重放绕过冷却。
- 输出不得含完整代码、可复制代码语句、最终答案或隐藏测试；代码检查最多三个问题和行号。SSE 必须完整清洗后分片，禁止透传原始 token，并兼容旧 JSON 客户端。
- 教师 AI 摘要只发送分类级聚合统计，不得发送学生用户名、题目标题、源码、AI 对话、隐藏测试或完整错误；配置/上游失败不阻断规则诊断和任务下发，配置指纹必须进入缓存哈希。
- `ObjectiveAiExplanation` 按题目和小题跨角色共享；数据库答案唯一权威，`isCorrect` 服务端生成。同一小题跨角色加锁，失败不覆盖旧缓存，题面/选项/答案/配置/提示词变化使缓存失效。

## 学情与专项练习

- 学情只分析编程提交，周期固定 `7d`、`30d`、`all`；有界窗口查询不得加载全部历史失败记录。
- 详情页只展示主要问题、持续卡题、最近失败、AI 摘要和推荐题；不要恢复分类掌握率、错误状态分布或题库缺口模块。
- 拼音排序在服务端生成 `sortKey`/首字母，浏览器不得打包拼音词库；搜索只过滤学生列表，切换周期重置搜索。
- 单份任务为 1–10 道不重复编程题；未归档任务仅管理员或创建老师可一次性保存题目、顺序、标题、说明、截止时间。保留行保留快照和 `completedAt`，新增行不继承历史 AC。
- 批量发布限 1–100 名学生，必须在单事务内预读账号、题目和未完成冲突；任一失败整批零写入，成功后每人独立任务。
- 同一道题不能出现在同一学生两份未完成任务中。移除已完成题只清空相关提交的 `learningAssignmentId` 并重算进度；不得删除提交或代码。进行中任务不能硬删，归档后才可永久删除。
- 只有携带合法 `learningAssignmentId` 的日常 Accepted 更新进度；普通日常、考试和历史 AC 不计。Judge 写库前重新确认任务题仍有效，评测中被移除则保存为普通练习并明确提示。
- 首页通过 `document.body` portal 汇总提醒有效未完成任务；无关闭/Escape 绕过，唯一入口 `/student/assignments`。按学生和任务版本静默 60 分钟，不新增服务端已读状态。

## 题型、考试与计分

- `Problem.problemType`、`Exam.examType` 仅 `programming`、`objective`；一场考试只能包含同类型题目，搜索、导入、增题和发布都校验。
- 客观题答案只存 `Problem.objectiveItems`；学生题目和考试 API 不返回 `answer`。后台校题默认隐藏答案并用统一按钮显隐，切题/刷新后恢复隐藏。
- 发布考试时必须写入 `ExamProblem` 的标题、题型、客观题内容和分值快照。已发布/已结束考试计分与结果优先使用快照，禁止题库后续修改改写历史。
- 只有草稿考试可修改核心信息、题目集合、顺序和分值。已发布考试只允许切换 AI 或结束；仅在没有 `ExamRecord` 时可取消发布并清空快照。草稿不能直接结束，已结束不能修改、取消或重新发布。
- 学生考试页使用锁定布局；离开考试路由、后退、刷新、关闭或退出调用幂等交卷。同场切题与切换浏览器标签不交卷；关键异步按钮必须在网络/解析失败后恢复 pending 状态并显示安全错误。
- 客观题不进入 Docker；每行一题，逐题结果写 `SubmissionCaseResult`。考试按单次提交的小题分值合计取最高分；同分按创建时间降序、提交 ID 降序选复盘记录。
- 三种角色提交客观题后可看题号、对错和自己的答案；学生永不因此看到标准答案。考试结果只在交卷/结束后展示计分提交逐题结果。
- 客观题小题分值为正整数，`ExamProblem.score` 为小题总和。Markdown 选项必须单行 `A. 内容`，题干代码用代码块，选项代码用行内代码。
- 富文本集中在 `ProblemRichText.tsx`；递归解析每次创建独立的带 `g` 正则，禁止共享会改变 `lastIndex` 的模块级实例。
- 单大题选择判断考试和后台考试练习隐藏左侧题单，多题保留；交卷确认文案不要写死方向。
- 学生题库“已通过”读取全部历史 Accepted，日常/考试、编程/客观题均计入，后续失败不取消。后台校题同理，并链接当前账号最近一次 Accepted。
- 积分实时按唯一 Accepted 题数 × 10，不新增缓存表；排序为积分、唯一 AC、AC 总次数、用户名、用户 ID。只有管理员改自定义头衔，头衔不影响积分和排名。
- `Problem.sortOrder` 和 `ProblemCategoryOrder` 仅管理员维护；标题/时间排序默认预览，保存时写一次性自定义快照，学生和老师只读跟随。

## 共享界面约束

- 浏览器标题/图标只由 `BrowserIdentity.tsx` 同步 `SystemSetting.browserTitle/browserIcon`；图标只接受服务端校验、256KB 内 PNG/ICO Data URL。
- 选择判断 AI 桌面端为“解析在上、答案在下”；解析可内部滚动，答案编辑器使用 `clamp(360px, 44dvh, 520px)`，答案外层不增加滚动；移动端自然排列。

## 本地质量检查

```bash
npm run test
npm run test:e2e
npx tsc --noEmit
npm run lint
npm run build
```
