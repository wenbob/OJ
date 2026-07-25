# 2026-07-25 独立老师端、AI 模型配置与教学管理增强上线记录

## 上线范围

- 新增 `teacher` 角色和独立 `/teacher` 页面体系。老师可以使用现有题库校题和组卷，管理学生、自己的考试及自己下发的专项练习，但不能访问题目管理、题目导入、系统设置或 AI 服务商配置。
- 后台页面抽取为角色感知的 staff 共用实现；管理员继续管理全部资源，老师访问考试和专项练习写接口时按创建人校验，越权资源不泄露存在性。
- `Exam` 新增可空的 `createdById` 归属关系和查询索引。新考试记录管理员或老师创建人，历史无归属考试继续由管理员管理；考试列表显示“出卷人”标签。
- 管理员系统设置支持 DeepSeek、豆包和自定义 OpenAI-compatible 服务，能够发现可用模型并配置思考模式。API Key 仍只从生产 `.env` 读取，不写入数据库、前端响应或日志。
- 自定义 AI 服务执行 HTTPS、DNS、私网地址、重定向、响应大小和超时限制；学生与老师端只读跟随管理员保存的全局模型配置。
- 专项练习题目选择器支持管理员保存的分类顺序和关键词组合筛选；未归档任务可以统一编辑标题、说明、截止时间及 1–10 道题目的新增、删除和排序。
- 删除专项练习题目只解除任务关联并重新计算进度，历史提交和代码保留；评测期间题目被移除时，本次记录降级为普通练习，不再误计入专项进度。
- 用户管理编辑面板在桌面端自适应 sticky 跟随，移动端保持普通布局；密码改为不可回显的安全重置流程，要求至少 8 位并二次确认。
- Next.js 构建配置读取 `NEXT_PRIVATE_BUILD_WORKER_COUNT`，本次 Linux 构建已实际限制为单 worker。

本次没有新增第三方依赖；数据库新增迁移 `0011_teacher_role_exam_ownership`。

## 本地验证与构建

- `npm run test -- --maxWorkers=1`：71 个测试文件、355 项测试通过。
- `npx tsc --noEmit`、`npm run lint`、`npx prisma validate` 和 `git diff --check` 通过。
- 在隔离的 WSL Ubuntu Linux 环境使用 Node.js 20.20.2 和 OpenSSL 3 完成 `npm ci --include=dev`、Prisma generate、空 SQLite 数据库全量 11 个迁移和 Next standalone 构建。
- 构建日志明确包含 `Collecting page data using 1 worker` 和 `Generating static pages using 1 worker`；Node 堆内存上限为 1GB。
- 发布包大小为 57,208,363 字节，SHA-256 为 `5f529bfb573e1cf840976a894bf70c3890773635a29f3e3c96ffac2af1964880`。
- 归档共 5,211 个条目，不含 `.env`、数据库、备份目录、根 `node_modules`、`.next/cache`、私钥或嵌套压缩包；Prisma 仅包含 `libquery_engine-debian-openssl-3.0.x.so.node`，standalone 静态资源和 `public` 均已打包。

## 生产发布与回滚点

- 发布前确认生产数据库完整性为 `ok`、没有进行中考试、PM2 `oj` 在线，且依赖清单与锁文件未变化。
- 生产数据库备份：`/www/backups/prod-20260725-120421-before-teacher-ai-assignment.db`，备份完整性为 `ok`。
- 旧版本回滚目录：`/www/oj-old-20260725-120421`。
- 服务器复用原有根 `node_modules`，未执行 `npm ci`、Next.js 构建、`seed` 或数据库初始化。
- 停止 PM2 后完成 SQLite WAL checkpoint、数据库备份和目录切换，再在新的 `/www/oj` 执行 `npm run db:deploy`；`0011_teacher_role_exam_ownership` 成功应用，累计 11 个迁移。
- 切换后数据库 `quick_check` 为 `ok`，外键检查为 0 条异常；用户 27、题目 1,330、提交 1,467、考试 0、专项练习 0，业务数据计数未因发布改变。

## 线上验收

- PM2 `oj` 在线，服务只监听 `127.0.0.1:3000`；本机和公网 `/api/health` 均返回数据库正常。
- 登录页及实际 CSS 静态资源返回 200，静态文件为 66,839 字节；`/teacher` 未登录访问返回 307 到 `/login`，无效登录返回受控的 401。
- 登录页的 CSP、`X-Frame-Options` 和 `X-Content-Type-Options` 三项安全响应头均存在。
- 生产库确认 `Exam.createdById` 和 `Exam_createdById_createdAt_idx` 已创建。
- 使用临时签名的真实管理员会话调用正式 `/api/problems/[id]/run` 路径完成 Docker Judge 冒烟，状态为 `completed`、输出为 `OJ_SMOKE`；试运行前后 `Submission` 均为 1,467 条。
- PM2 错误日志最后修改时间早于本次发布；其中保留的 Server Action 失效信息来自旧页面请求，本次切换后没有新增错误。

## 洁癖收尾

- 线上验收通过后删除服务器临时发布包和三个临时发布脚本，确认 `/www/oj-new` 不存在并再次通过健康检查。
- 保留本次数据库备份和旧版本回滚目录；未清理其它历史备份、其它站点、股票系统或 Docker 全局资源。
- 删除已完成的临时实施计划，压缩 `AGENTS.md` 中重复的历史发布索引和 AI 规则，同时保留全部当前约束。
- README、管理员手册、老师手册、学生说明、部署手册和 `AGENTS.md` 已按当前权限边界与实际行为同步。
