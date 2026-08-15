# 2026-08-15 登录页说明文案热修复发布记录

## 发布范围

- 生产功能提交：`9587852`。
- 仅删除登录表单标题下方“使用老师发放的账号进入学生端或管理员端。”说明文字。
- 登录表单、角色鉴权、跳转规则和全站备案页脚保持不变。
- 本次没有新增依赖、数据库迁移、API、权限或 Judge 行为变更。

## 本地验证

- `npm run test`：112 个测试文件、608 项测试全部通过。
- `npx tsc --noEmit` 与登录页定向 ESLint 检查通过。
- Linux Docker standalone 构建通过，使用 Node 22、OpenSSL 3 和单构建 worker。
- 发布包大小为 `46,979,848` 字节，SHA-256 为 `e2b75083ff7fb5907343787b0aca2417f6e357497256c71ed69293f2c6ccd3d4`。
- 归档审计确认没有 `.env`、数据库、备份、根 `node_modules`、`.next/cache`、嵌套压缩包或错误 Prisma 引擎；归档根权限为 `0755`。

## 生产切换

- 发布前有效 `in_progress` 正式考试为 0，生产库 `PRAGMA quick_check` 为 `ok`。
- 数据库备份：`/www/backups/prod-20260815-092642-before-login-copy.db`。
- 回滚目录：`/www/oj-old-20260815-092642`。
- 18 个迁移均已应用且无待执行项；未执行 `seed` 或 `db:init`。
- PM2 进程 `oj` 重启后在线，服务继续只监听 `127.0.0.1:3000`。
- 服务器发布压缩包已删除；数据库备份与回滚目录继续保留。

## 生产验收

- 直连和公网健康检查分别连续 5 次通过。
- 公网登录页目标说明文字不存在，登录标题及 ICP、公安备案信息正常显示。
- 实际 CSS 资源返回 200，启用 gzip 和 immutable 缓存；未登录 `/api/auth/me` 返回 401。
- 受限 Docker Judge 冒烟输出 `OJ_LOGIN_COPY_SMOKE:42`，前后 `Submission` 均为 1,561 条。
- `origin/main`（`wenbob/OJ`）和 `oj2026/main`（`wenbob/2026-OJC`）均已推送到 `9587852`。
