# 2026-07-27 全角色选择判断逐题反馈上线记录

## 上线范围

- 学生、老师和管理员提交选择判断答案后，结果区立即展示本次提交的题号、正确或错误以及自己的答案，并可收起、再次展开或进入完整提交详情。
- 客观题提交详情统一使用中文逐题状态，并直接显示题号、对错和本次答案。
- 学生考试结果页在交卷或考试结束后展示实际计分提交的逐题反馈；多次提交取最高分，同分时依次选择创建时间较新、提交 ID 较大的记录。
- 学生接口和页面继续隐藏标准答案；管理员和老师仍通过校题页原有的“显示答案”按钮查看标准答案。

本次没有新增数据库迁移、公开 API、第三方依赖或权限范围。

## 本地验证与 Linux 构建

- `npx prisma validate` 通过。
- `npm run test`：81 个测试文件、427 项测试通过。
- `npx tsc --noEmit`、`npm run lint` 和 `git diff --check` 通过。
- 本地浏览器冒烟覆盖学生、老师、管理员的客观题即时反馈，以及考试结果页的最高分和同分复盘选择。
- Docker `node:22-bookworm-slim` 使用 2 CPU、2GB 容器内存、1GB Node 堆和单 worker 完成 Linux standalone 构建；空 SQLite 数据库完整应用 13 个迁移。
- 发布包大小为 50,297,375 字节，SHA-256 为 `98cd1ff7f12e3fea43c4bd2a5089501043bfbf95224d42ce9c4149f3f137c43a`，共 3,492 个归档条目。
- 归档不含任何层级的 `.env`、数据库、备份、根 `node_modules`、`.next/cache` 或嵌套压缩包；standalone 已包含静态资源、`public` 和唯一的 `libquery_engine-debian-openssl-3.0.x.so.node`。
- 使用带 OpenSSL 3 的独立容器解包冒烟，`/api/health`、登录页和 10 个实际静态资源均正常。

## 生产发布与回滚点

- 发布前 PM2、内外健康检查、SQLite `quick_check`、依赖锁文件和 Docker Judge 镜像正常，进行中考试为 0。
- 生产数据库备份：`/www/backups/prod-20260727-090956-before-objective-feedback.db`。
- 旧版本回滚目录：`/www/oj-old-20260727-090956-objective-feedback`。
- 服务器复用原有根 `node_modules`，未执行 `npm ci`、Next.js 构建、`seed` 或数据库初始化。
- 停止 PM2 后完成 SQLite WAL checkpoint、备份、最新数据库复制和目录切换；`npm run db:deploy` 确认 13 个迁移全部完成且没有待执行项。
- 发布前后业务计数一致：用户 27、题目 1,330、提交 1,462、测试点 2,295、考试 0、考试记录 0、专项练习 0。

## 线上验收与洁癖收尾

- PM2 `oj` 在线，工作目录为 `/www/oj`，服务只监听 `127.0.0.1:3000`。
- 本机和公网 `/api/health` 均返回数据库正常；SQLite `quick_check` 为 `ok`，外键异常为 0。
- 公网登录页和全部 10 个实际 CSS/JS 静态资源返回 200；CSP、`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy` 和 `Permissions-Policy` 齐全，无效登录返回受控的 401。
- 使用临时签名的真实管理员会话调用正式 `/api/problems/[id]/run`，Docker Judge 返回 `completed`，输出为 `OJ_SMOKE`，运行时间 295ms；试运行前后 `Submission` 均为 1,462 条。
- 线上验收后删除服务器发布压缩包和临时响应文件，确认 `/www/oj-new` 与失败切换目录不存在；最终健康检查继续正常。
- 保留本次数据库备份和旧版本回滚目录；未清理其它历史备份、其它站点、股票系统或 Docker 全局资源。
- README、学生说明、老师手册、管理员手册和 `AGENTS.md` 已与全角色逐题反馈、学生答案保护和考试复盘选择规则同步。
