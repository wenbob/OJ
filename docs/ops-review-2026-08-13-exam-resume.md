# 2026-08-13 正式考试横向题签与误交卷恢复发布记录

## 发布范围

生产功能提交：

```text
1fa17f7  feat: redesign exam workspace and resume submissions
```

- 学生正式考试多题页改为顶部单行横向题签，单题不显示冗余题签；桌面端题面与代码/答案区域约为 `58% / 42%`，右侧编辑区吸顶，移动端自然上下排列。
- 编程题在本场考试任意一次 `Accepted` 后题签持续显示淡绿色，后续失败不取消；客观题只显示作答状态。
- 管理员可恢复全部符合条件的误交卷记录，老师只能恢复自己考试的记录。恢复要求 2–200 字原因，保留首次开始时间、答案、代码和历史提交，不延长原倒计时。
- 新增 `POST /api/admin/exams/:examId/records/:recordId/resume`、一次性恢复登录许可和 `ExamRecordResumeAudit` 审计表；恢复、交卷和开考继续按学生串行并在事务内复核状态。
- 新增迁移 `0018_exam_record_resume_audit`。生产发布前没有有效 `in_progress` 考试窗口，未执行 seed 或 `db:init`。

## 本地验证与 Linux 发布包

- `npm run test`：110 个测试文件、595 项测试通过。
- `npx tsc --noEmit`、`npm run lint`、`npx prisma validate`、`npm run build` 全部通过。
- `npm run test:e2e`：Playwright 7/7，通过“学生误交卷 → 管理员恢复 → 学生重新登录继续考试”等关键链路。
- 在本地 Linux/Docker amd64 环境按 2 CPU、2GB 内存、单 Next worker完成 Ubuntu standalone 构建；空 SQLite 成功应用 18 项迁移，standalone 健康接口与登录页均为 HTTP 200。
- 发布包：`tmp/release-1fa17f7-20260813-173542-exam-resume/oj-release-1fa17f7-linux-x64.tgz`，大小 `47,359,192` 字节，SHA-256 为 `f98a5fad62ddf809e890150c12cea3f8688c0b87824585301beaa4ef41fde222`。
- 归档共 3,773 个条目；环境文件、数据库、根 `node_modules`、`.next/cache`、嵌套压缩包、私钥和路径穿越条目均为 0。包内存在静态资源、`public`、`0018`、恢复 API 和唯一的 OpenSSL 3 Prisma 引擎。

## 生产切换与恢复点

- 切换前直连与公网健康正常，SQLite `quick_check=ok`，有效考试窗口为 0。
- 发布时间：`2026-08-13 18:14:33 +08:00`。
- 数据库备份：`/www/backups/prod-20260813-181418-before-exam-resume.db`，大小 `6,946,816` 字节，SHA-256 为 `a3ab9e214dd68f9dbbfdd78e7fe92252ab456bb8a56410422a9146e10b8a820d`，`quick_check=ok`。
- 应用回滚目录：`/www/oj-old-20260813-181418-exam-resume`。
- 依赖锁未变化，复用生产根 `node_modules`；服务器没有执行依赖安装、Next.js 构建、seed、`db:init` 或 Docker 全局清理。
- `db:deploy` 只新增 `0018`，生产迁移总数为 18。切换前后业务数据量一致：31 用户、1,370 题目、1,558 提交、1 场考试、0 考试记录、1 份专项练习；恢复审计初始为 0。

## 上线验收与发布权限修复

- PM2 `oj` 在线，工作目录 `/www/oj`，服务只监听 `127.0.0.1:3000`；直连和公网健康、SQLite `quick_check` 持续正常。
- 生产源码确认顶部题签、已通过淡绿色和右侧吸顶编辑区均已部署；恢复 API、迁移文件、数据库列和审计表均存在。
- 未登录系统设置返回 401，未登录恢复接口返回 403，学生页返回 307；登录页继续展示 `陕ICP备2026021441号-1`，AC 图片返回 200。
- 首次解包后 `/www/oj` 继承 Linux `mktemp -d` 的 `0700` 根权限，导致 Nginx 直出的 CSS/JS 返回 403。证据为 Nginx `open() ... failed (13: Permission denied)`，应用与数据库本身正常。
- 立即把 `/www/oj` 恢复为 `0755`，并保持 `.env` 为 `0600`；随后公网 CSS/JS 均返回 200，启用 gzip 与一年 immutable 缓存，HSTS 和 `nosniff` 正常。该规则已同步进 `AGENTS.md` 和 `docs/deploy.md`。
- 修复后 Nginx 没有新增 5xx/504，PM2 错误日志在本次发布前已停止增长。服务器上传包已删除，`/www/oj-new` 不存在；数据库备份和旧应用目录继续保留。

## 回滚

若需要回滚，停止 PM2，把 `/www/oj-old-20260813-181418-exam-resume` 恢复为 `/www/oj`，并将 `/www/backups/prod-20260813-181418-before-exam-resume.db` 复制回 `/www/oj/prisma/prod.db`，再通过 `pm2 restart oj --update-env` 启动并检查直连与公网健康。
