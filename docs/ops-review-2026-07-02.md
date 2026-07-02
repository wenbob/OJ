# 2026-07-02 AI 思路上线与低内存发布事故修正记录

## 上线范围

本次把本地已验证的 AI 思路功能发布到线上 `/www/oj`，同时包含前一轮头衔天梯、提交安全加固和 AI 对抗审查后的修复。

AI 思路功能包括：

- 管理员全局控制日常练习 AI 思路开关。
- 管理员按考试控制 AI 思路开关，默认关闭。
- 学生编程题编辑器上方显示“AI 思路”，选择判断题不开放 AI。
- AI 只发送题目、输入输出说明、数据范围和公开样例，不发送隐藏测试点。
- AI 返回内容必须是题目分析、解题步骤和小提醒；不允许完整代码或可复制 C++ 片段。
- 5 分钟内同题同 prompt 复用最近一次有效 AI 思路；空内容和错误不缓存。
- DeepSeek 调用设置 15 秒超时；学生端不暴露 `DEEPSEEK_API_KEY` 等内部环境变量名。

## 发布方式

本次仍遵守低内存服务器原则：没有在服务器执行 Next.js 构建。发布包在本地 Linux Docker 环境生成：

```text
tmp/release/oj-release.tgz
```

构建流程：

1. 本地 Docker `node:20-bookworm` 容器内执行 `npm ci`。
2. 容器内执行 `npm run build` 生成 Linux standalone。
3. 复制 `.next/static` 到 `.next/standalone/.next/static`。
4. 复制 `public` 到 `.next/standalone/public`。
5. 打包时排除 `.env`、数据库、备份、根 `node_modules`、`.next/cache` 和压缩包。

发布包检查结果：

- 不含 `.env`。
- 不含 SQLite 数据库。
- 不含根目录 `node_modules`。
- 不含 `.next/cache`。
- 包含 `.next/standalone/server.js`。
- 包含 `.next/standalone/.next/static` 和 `.next/standalone/public`。

## 本次事故与修正

第一次准备 `/www/oj-new` 时，在服务器执行了 `npm ci`。虽然没有在服务器构建 Next.js，但 2 核 2GB 服务器仍被依赖安装过程拖到 SSH banner 和 HTTP 健康检查都超时，只剩 22/80 端口可连。服务器通过云控制台重启后恢复。

修正后的流程：

- 服务器不再执行 `npm ci`。
- 依赖版本未变化时，用 `cp -al /www/oj/node_modules /www/oj-new/node_modules` 复用当前线上依赖。
- 依赖变化时，优先在本地 Linux/Docker 生成可用于 Ubuntu 的根 `node_modules` 随包上传；不要在 2GB 服务器热运行 `npm ci`。

另一个关键修正：

- 生产 `.env` 使用绝对路径 `DATABASE_URL=file:/www/oj/prisma/prod.db`。
- 因此不要在切换前的 `/www/oj-new` 执行 `npm run db:deploy`，否则实际迁移的是旧 `/www/oj` 下的数据库。
- 正确做法是停 PM2、备份并复制最新 DB、切换 `/www/oj-new` 为 `/www/oj`，然后在新的 `/www/oj` 执行 `npm run db:deploy`。

## 备份与回滚点

上线前备份：

```text
/www/backups/prod-20260702-133909-before-ai-assist-deploy.db
```

切换后旧目录：

```text
/www/oj-old-20260702-133909
```

如果需要回滚，先停止 `oj`，把当前 `/www/oj` 改名保留，再把上述旧目录恢复为 `/www/oj`，最后 `pm2 restart oj --update-env` 并检查 `/api/health`。

## 数据库迁移

本次新增迁移：

```text
0004_ai_assist
```

线上确认：

- `_prisma_migrations` 包含 `0004_ai_assist`。
- `Exam` 表包含 `aiEnabled` 字段。
- `SystemSetting` 包含 `aiPracticeEnabled=false`。

## 验证结果

上线后确认：

- `pm2 list` 中 `oj` 为 `online`。
- 本机 `/api/health` 返回 `{"ok":true,"database":"ok","timestamp":"..."}`。
- 公网 `/api/health` 返回 200。
- `/login` 返回 200。
- 登录页引用的 10 个 `_next/static` CSS/JS 资源均返回 200。
- 安全响应头包含 `Content-Security-Policy`、`Referrer-Policy`、`X-Content-Type-Options`、`X-Frame-Options` 和 `Permissions-Policy`。
- `/www/oj/.env` 中 `DATABASE_URL` 为 `file:/www/oj/prisma/prod.db`。
- 上传包 `/www/oj-release.tgz` 已在验证后删除。

## 后续维护注意

- AI 功能默认关闭，生产环境如需启用，先在 `/www/oj/.env` 配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL=https://api.deepseek.com` 和 `DEEPSEEK_MODEL=deepseek-v4-pro`。
- 客观题不要开放 AI，避免直接泄露选择判断答案。
- 服务器发布不要执行 `npm ci`、`npm run build`、`npm run seed` 或 `npm run db:init`。
- 如果依赖变化，先本地 Linux/Docker 生成可用依赖，再上传；不要让 2GB 服务器承担依赖安装。
