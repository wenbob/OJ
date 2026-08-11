# 2026-08-11 P1/P2 风险修复与生产发布记录

## 发布范围

生产代码提交为 `774b03ab36f6e2c3b34c10c5d17ba8e445f7ec6d`，包含上一批学生 Judge 详情脱敏热修复，以及本轮审查确认的 12 个 P1、5 个 P2：

- AI 输出清洗、登录密码校验并发占位、系统设置 revision 冲突保护、客观题提交并发占位。
- 学情“全部”窗口数据库聚合、后台用户服务端搜索分页、当前页排名聚合、题目列表查询上限和覆盖索引。
- 单题下架、考试发布/取消发布、题单增删改和学生开始考试的事务内状态复查。
- Judge 按账号限制运行/等待数量并在同优先级内公平轮转；测试点数量、单点体积和总字节设上限；整任务增加 60 秒默认预算和最终清理 watchdog。
- Markdown 样例按编号配对并拒绝重号/缺号，章节解析识别代码围栏，超大富文本表格退化为纯文本。
- 管理密码按 UTF-8 拒绝超过 bcrypt 72 字节边界。

新增迁移 `0017_submission_status_user_problem_index`，为 `Submission(status, userId, problemId)` 增加覆盖索引。本次没有执行 `seed` 或 `db:init`。

## 本地验证与 Linux 发布包

- `npm run test`：106 个测试文件、571 项测试通过。
- `npx tsc --noEmit`、`npm run lint`、`npm run build` 和 `npm run test:e2e` 全部通过。
- Prisma schema 校验通过；临时空 SQLite 库从 `0001` 到 `0017` 完整迁移成功。
- Docker `node:20-bookworm-slim` 使用 2 CPU、2GB 内存、1GB Node 堆和单 worker 完成 Linux standalone 构建；Node.js 为 20.20.2，OpenSSL 为 3.0.20。
- 发布包为 `tmp/release-774b03a-20260811/oj-release-774b03a-linux-x64.tgz`，大小 `54,904,940` 字节，SHA-256 为 `d110d408f0b17abf6e862bb21da07a4d91da84794241ee0c0a9bd0ac38f4c8f5`。
- 归档共 5,636 个条目；环境文件、数据库、根 `node_modules`、`.next/cache`、嵌套压缩包、私钥和路径穿越条目均为 0。
- standalone 包含 `.next/static`、`public` 和唯一的 `libquery_engine-debian-openssl-3.0.x.so.node`；隔离启动后的健康、登录页实际 CSS 和 `/ac-success.png` 均正常。

## 生产预检、发布与回滚点

- 发布前直连与公网健康接口正常，SQLite `quick_check` 为 `ok`，生产库有 16 个已完成迁移，`in_progress` 考试总数和有效考试数均为 0。
- 本地与生产 `package-lock.json` SHA-256 均为 `b4b4015e0e9668e472a729fb28cdd974461a1df22bb3476b55cb37d606c41ec3`，因此复用生产根 `node_modules`；服务器没有执行 `npm ci` 或 Next.js 构建。
- 发布时间为 `2026-08-11 13:44:03 +08:00`。停止 PM2 后使用 SQLite 原生备份生成 `/www/backups/prod-20260811-134403-before-p1-p2.db`。
- 备份大小为 `6,885,376` 字节，SHA-256 为 `abd18e328c55ed708bcb302a50135be418c5e24b8211df1a7e2c7b2e6afea69f`，完整性检查为 `ok`。
- 旧版本目录保留在 `/www/oj-old-20260811-134403-p1-p2`；切换失败脚本会自动恢复旧目录并重启 PM2。
- 切换后 `0017_submission_status_user_problem_index` 成功应用，生产库累计 17 个迁移，新索引存在且 `quick_check` 为 `ok`。
- 发布前后业务计数一致：用户 30、题目 1,370、提交 1,558、考试 0、考试记录 0、专项练习 1。

## 上线验收与清理

- PM2 `oj` 在线，进程目录为 `/www/oj`，服务只监听 `127.0.0.1:3000`。
- 直连和正式域名健康检查各连续 5 次成功；登录页实际 CSS `/_next/static/chunks/1jfg7akq9krvy.css` 和 `/ac-success.png` 返回 200，基础安全响应头完整。
- 未登录访问管理员用户接口返回 401。
- 真实学生会话读取最近编程提交时，2 个测试点的输入、期望输出、实际输出和内部错误详情均被服务端隐藏；管理员读取同一提交仍保留完整 Judge 数据。
- 正式 `POST /api/problems/[id]/run` 路径完成受限 Docker Judge 冒烟，返回 `completed` 和 `OJ_SMOKE_774b03a:42`；试运行前后提交总数均为 1,558。
- 最近 500 条 Nginx 访问记录中 504 为 0；验收后数据库仍为 17 个迁移、无进行中考试。
- 服务器上传包已删除，`/www/oj-new` 不存在；数据库备份和旧版本目录作为恢复点保留。本地仅保留审计通过的发布包，约 1GB 的临时构建目录已经删除。
- 未执行 `npm run seed`、`npm run db:init`、Docker 全局清理，也未触碰同机其他站点和容器。
