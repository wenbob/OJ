# 2026-07-15 AI 分层辅导、教师学情看板、专项练习与浏览器标签配置上线记录

## 上线范围

- 学生 AI 助手改为个人权限与日常/考试开关共同控制，提供理解题目、下一步提示、检查当前代码和当前题自由追问。
- 新增学生错题本、薄弱知识点和筛选位置保持，提交后自动定位评测结果。
- 新增管理员教师学情看板，支持 `7d`、`30d`、`all` 三个分析周期、规则诊断、聚合 AI 摘要、题目推荐和题库缺口提示。
- 新增学生专项练习列表、详情、教师说明、截止日期和完成进度；只有从专项入口产生的日常 `Accepted` 才计入任务。
- 专项练习题目下发后锁定；进行中任务可编辑或归档，归档后管理员可永久删除。

对应功能提交：

```text
11ae322 Add student mistake book and weak topics
5329dbe Add per-student layered AI coaching
f249d1d Add teacher learning dashboard and assignments
93a8da3 Add archived assignment deletion
```

## 数据库迁移

上线前生产库已有 `0001`–`0004`。本次备份后成功应用：

```text
0005_ai_student_access
0006_learning_dashboard_assignments
```

新增学生个人 AI 权限、专项练习、任务题目、教师摘要快照和提交的专项练习关联。未执行 `db:init` 或 `seed`。

## 发布方式与兼容检查

- 在本地 Docker 中生成 Linux standalone 产物，服务器未执行 `npm ci` 或 Next 构建。
- 依赖文件未变化，线上复用原 `/www/oj/node_modules`。
- 首次本地包审计发现 Prisma 回退生成 OpenSSL 1.1 引擎，因此未上传该包。
- 构建容器安装 OpenSSL 后重新构建，确认最终包为 `libquery_engine-debian-openssl-3.0.x.so.node`，与生产机一致。
- 发布包包含 `.next/standalone/.next/static` 和 `.next/standalone/public`，不包含真实 `.env`、数据库、根 `node_modules` 或构建缓存。

## 备份与回滚点

```text
数据库备份：/www/backups/prod-20260715-154055-before-learning-dashboard.db
旧版本目录：/www/oj-old-20260715-154055
```

数据库备份和旧版本目录均已验证存在。服务器发布压缩包已删除，最新回滚点继续保留。

## 线上验证

- PM2 进程 `oj` 在线，应用工作目录为 `/www/oj`。
- 直连 Next 与经 Nginx 的 `/api/health` 均返回数据库正常。
- 公网登录页引用的 `_next/static` 资源返回 200，应用只监听 `127.0.0.1:3000`。
- `/admin/learning` 未登录时重定向登录页；未登录调用专项练习删除接口返回 403。
- 生产库存在 `LearningAssignment`、`LearningAssignmentProblem`、`LearningInsightSnapshot`，以及 `aiAccessEnabled`、`learningAssignmentId` 字段。
- `/www/oj` 权限为 `750`，生产 `.env` 和 SQLite 数据库权限为 `600`。
- `oj-cpp-judge` 使用线上隔离参数成功编译并运行最小 C++17 程序，输出为 `42`。

## 本地与 GitHub 验证

- `npm run test`：30 个测试文件、173 项测试通过。
- `npx tsc --noEmit`、`npm run lint`、`npm run build` 通过。
- `origin/codex/ai-problem-assist` 与 `oj2026/codex/ai-problem-assist` 均已同步到 `93a8da3`；本发布记录与文档修正作为独立收尾提交同步。

## 清理边界

- 只删除本次 OJ 发布压缩包、本地发布临时目录和专用本地 Docker volume。
- 保留最新数据库备份和旧版本回滚目录。
- 未清理其它网站、股票系统、Docker 全局缓存、镜像或无关 volume。

## 同日增量：浏览器标签名称与图标

管理员系统设置新增浏览器标签配置：

- `browserTitle` 单独控制标签名称；留空时使用 `siteName`。
- `browserIcon` 保存经过服务端校验的 PNG 或 ICO Data URL，原文件最大 256KB，可恢复浏览器默认图标。
- 设置保存在既有 `SystemSetting` 键值表，不需要新增 Prisma 迁移；发布目录切换不会丢失。
- 页面首次响应使用动态 metadata，管理员保存后由 `BrowserIdentity` 立即刷新当前标签页。

功能提交：

```text
7ffb765 Add configurable browser title and icon
```

本地检查为 32 个测试文件、183 项测试通过，`npx tsc --noEmit`、`npm run lint` 和 `npm run build` 通过。

本地 Linux standalone 构建和审计补充发现两个可复现陷阱：

- 构建容器加载生产环境后，普通 `npm ci` 会省略 Tailwind 等 devDependencies；改用 `npm ci --include=dev` 后构建通过。
- Next 文件追踪会把本地 `.env` 复制到 `.next/standalone/.env`；首个包在上传前被审计拦截，移除所有环境文件并重新打包、复核 SHA-256 后才上传。

本次服务器未执行 `npm ci`、Next 构建、`seed` 或数据库初始化，依赖未变化并复用原 `/www/oj/node_modules`。增量发布回滚点：

```text
数据库备份：/www/backups/prod-20260715-165021-before-browser-identity.db
旧版本目录：/www/oj-old-20260715-165021
```

线上确认 PM2、直连 Next 与 Nginx 健康接口正常，公网登录页标题为管理员配置的 `OJ C++平台`，静态资源返回 200，服务只监听 `127.0.0.1:3000`，Docker Judge 冒烟输出为 `42`。服务器发布压缩包、本地临时发布目录和本次专用 Docker volume 已删除；数据库备份和旧版本回滚目录继续保留。
