# 2026-08-14 学生考试导航热修复发布记录

## 发布范围

- `c171244`：修复新设备先刷新登录页、再通过客户端导航首次进入考试时被误判为刷新考试页并自动交卷的问题；真正刷新考试页仍按规则交卷，`/expire` 由服务端复核截止时间。
- `59914cc`：学生在正式考试中使用浏览器后退、`Alt+←` 或鼠标后退键时留在当前题目，不发送交卷请求，并显示 3 秒提示。题目切换后重新布置历史哨兵，完整保留 Next.js `history.state`。
- `ae405bd`：删除学生模拟考试页“这里只展示管理员已发布的考试”说明，并同步 `AGENTS.md`、`README.md` 与学生指南中的长期规则。
- 本次没有新增依赖、数据库迁移、公开 API 或计分规则变更。

## 本地验证

- `npm run test`：112 个测试文件、608 项测试全部通过。
- `npx tsc --noEmit`、`npm run lint` 通过。
- 完整 Playwright：8 项通过，覆盖首次进入考试等待 60 秒、连续三次后退、切题后后退、草稿保留、误交卷恢复后后退，以及真正刷新仍交卷。
- `ExamExitGuard.tsx` 定向覆盖率：语句由 `15.47%` 提升到 `20.83%`，分支由 `16.66%` 提升到 `35.10%`。
- Linux Docker standalone 构建通过，使用 Node 22、OpenSSL 3 和单构建 worker。

## 发布包审计

- 本地归档：`tmp/release-ae405bd-20260814-exam-back/oj-release-ae405bd-linux-x64.tgz`。
- 大小：`46,982,146` 字节；SHA-256：`a4253551c6ed66286ee1f8385f1bf2924868b63288e47550e0126c841409fa3e`。
- 共 `3,779` 个条目；归档根权限为 `0755`。
- 真实环境文件、数据库、根 `node_modules`、`.next/cache`、密钥、嵌套压缩包和错误 Prisma 引擎均为 0。
- 公开模板 `.env.example` 与 Git 跟踪文件一致；standalone 内已包含静态资源和 `public`。
- Prisma 引擎为 `libquery_engine-debian-openssl-3.0.x.so.node`。

## 生产切换

- 发布前 PM2 `oj` 在线，生产库 `PRAGMA quick_check` 为 `ok`，有效 `in_progress` 考试记录为 0。
- 数据库备份：`/www/backups/prod-20260814-130421-before-exam-back.db`，大小 `6,950,912` 字节。
- 回滚目录：`/www/oj-old-20260814-130421`，权限 `0755`。
- 生产根目录保持 `0755`，`.env` 保持 `0600`；复用原服务器根 `node_modules`，未在 2GB 服务器执行 `npm ci` 或 Next 构建。
- `prisma migrate deploy` 确认 18 个迁移均已应用，无待执行迁移；未执行 `seed` 或 `db:init`。
- PM2 使用 `pm2 restart oj --update-env` 重启并恢复在线。
- 验收后删除 `/www/oj-release.tgz`，确认 `/www/oj-new` 不存在；数据库备份和回滚目录继续保留。

## 生产验收

- 直连与公网健康检查分别连续 5 次返回 HTTP 200、数据库 `ok`；服务只监听 `127.0.0.1:3000`。
- 登录页返回 200 并展示 `陕ICP备2026021441号-1`；11 个实际 CSS/JavaScript 资源全部返回 200。
- 公网 CSS 启用 gzip 和一年 immutable 缓存；HSTS、`nosniff`、CSP 等安全头正常。
- `/ac-success.png` 返回 `200 image/png`；未登录管理员设置接口返回 401，学生考试列表返回 307 到登录页。
- 受限 Docker Judge 冒烟返回 `OJ_EXAM_BACK_SMOKE:42`；试运行前后 `Submission` 均为 1,561 条。
- 发布后数据库 `quick_check` 仍为 `ok`，进行中考试为 0；验收期间 PM2 错误日志大小未增长。
- 生产运行代码对应 `ae405bd`；GitHub `wenbob/OJ` 与 `wenbob/2026-OJC` 的 `main` 均已包含该提交。
