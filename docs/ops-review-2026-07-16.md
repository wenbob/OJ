# 2026-07-16 运行样例与自定义输入上线记录

## 上线范围

- 编程题编辑器新增“运行样例 / 自定义输入”双标签，覆盖学生日常练习、专项练习、编程考试、管理员题目练习和管理员考试练习。
- 运行样例一次编译后执行全部公开样例并比较输出；自定义输入只返回程序实际输出和运行状态。
- 选择判断题不显示试运行区域。
- 试运行使用独立 `POST /api/problems/[id]/run`，不创建 `Submission`，不影响积分、天梯、错题本、考试成绩或专项练习进度。
- 正式提交和试运行共用 Judge 队列；正式提交优先于尚未开始的试运行。每账号同时一个试运行，结束后冷却 5 秒。

## 安全边界

- 样例输入和标准输出只从服务端公开样例读取，不接受客户端覆盖，也不读取隐藏测试点。
- 代码最大 128KB，自定义输入最大 32KB。
- 学生考试请求重新检查考试发布状态、题目归属、开始记录、交卷状态和超时状态。
- Docker Judge 原有无网络、只读根文件系统、非特权用户、CPU、内存、进程、时间和输出限制保持不变。
- 正式 `judgeCppCode` 保持原有返回结构，试运行通过共享执行层返回独立状态。

## 本地验证

- `npm run test`：37 个测试文件、204 项测试通过。
- `npx tsc --noEmit`、`npm run lint`、Linux 容器内 `npm run build` 均通过。
- 本地真实 Docker Judge 验证了公开样例匹配、自定义输入、编译错误和超时。
- 1440px、768px、390px 下试运行区域可用，选择判断题不显示，浏览器控制台无错误。

## 发布方式

- 在本地 `node:20-bookworm` Linux 容器中执行 `npm ci --include=dev`、`prisma generate` 和 Next standalone 构建，服务器未执行 `npm ci` 或 Next 构建。
- 发布包约 52.3MB，SHA-256 为 `c01a2332ae869300adaa32eb8bfe5f97efc736a93bf0e7ae44cf92a37dec79fb`。
- 包内 Prisma 引擎为 `libquery_engine-debian-openssl-3.0.x.so.node`，包含 standalone 静态资源和 public；审计未发现 `.env`、数据库、根 `node_modules`、构建缓存或嵌套压缩包。
- 依赖未变化，服务器复用现有根 `node_modules`。

## 备份与回滚点

- 生产数据库备份：`/www/backups/prod-20260716-111159-before-problem-runner.db`。
- 旧版本目录：`/www/oj-old-20260716-111159`。
- 迁移检查发现 6 个 migration 均已应用，没有待执行项。
- 上传包 `/www/oj-release.tgz` 已在验证后删除；旧版本目录暂时保留作为回滚点。

## 线上验证

- PM2 `oj` 在线，`/api/health` 返回 `ok` 和 `database: ok`。
- 服务监听 `127.0.0.1:3000`，登录页静态 CSS 返回 200。
- 使用真实学生会话调用自定义输入试运行：HTTP 200、状态 `completed`、输出 `42`，Docker Judge 运行时间 272ms。
- 试运行前后生产 `Submission` 均为 1416 条，确认没有写入正式提交数据。
- 功能提交 `4d288b0` 已推送到 `origin/main` 和 `oj2026/main`。

## 维护结论

- 上课前应分别验证一次试运行和正式提交；试运行正常不能替代 Accepted 冒烟。
- 429 表示同账号已有试运行或仍在 5 秒冷却，不应直接判断为 Docker 故障。
- 公开样例匹配不代表隐藏测试点通过，学生仍需执行正式提交。
