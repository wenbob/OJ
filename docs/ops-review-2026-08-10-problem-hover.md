# 2026-08-10 未完成题目悬停高亮与生产发布记录

## 范围与边界

- 已通过题目继续使用原有淡绿色；未通过、未提交和未做题目只在支持悬停的设备上显示 `rgba(79, 111, 136, 0.12)` 浅钢蓝背景。
- 保留题目行原有向右移动和文字变色；不扩大可点击区域，不改变链接、状态、提交统计、排序或权限。
- 覆盖学生日常题库、老师/管理员共用题库、学生正式考试题单，以及老师/管理员共用考试练习题单。
- 颜色规则使用题目项专用语义类，不作用于提交记录、用户管理、排行榜等普通表格；触屏设备通过 `@media (hover: hover)` 避免粘滞悬停。
- 本次没有 API、数据库、迁移、依赖、配置或权限变更。

生产运行代码提交为 `77d6197628b00d97f28009b3c3999faef59cedc9`（`fix: improve incomplete problem hover visibility`）。

## 本地验证

- `npm run test`：96 个测试文件、529 个测试通过。
- `npx tsc --noEmit`、`npm run lint`、`npm run build`：全部通过。
- `npm run test:e2e`：关键流程用例通过；隔离数据包含老师账号和已通过题目状态。
- E2E 覆盖学生、老师、管理员日常题库，学生考试和后台考试练习；校验浅钢蓝计算色、已通过绿色、2px 位移和链接目标。
- 桌面浏览器实测未完成题目悬停为 `rgba(79, 111, 136, 0.12)`，已通过题目保持绿色；移动视口的 `(hover: hover)` 为 `false`，背景不粘滞。

## Linux 发布包

- 在本机 Docker Linux 环境使用 Node 20 与 OpenSSL 3 重新生成 standalone；Prisma 引擎为 `libquery_engine-debian-openssl-3.0.x.so.node`。
- 已审计发布包：`tmp/oj-release-77d6197-linux-x64.tgz`。
- 大小：`46,580,752` 字节。
- SHA-256：`15cd9335c1da3e667bcbfd2533885dab9443cf8b1d3336f46d8e6a516c4c529a`。
- 包内共 3,701 个条目；环境文件、数据库、`.next/cache`、根 `node_modules`、嵌套压缩包、私钥和路径穿越条目均为 0。
- 隔离启动从空 SQLite 库应用全部 16 个迁移后，`/api/health` 返回数据库 `ok`；登录页加载的编译后 CSS 同时包含语义类和目标颜色。

## 生产发布与恢复点

- 发布时间：`2026-08-10 00:21:16 +08:00`。
- 发布前数据库完整性为 `ok`，完成迁移 16 个，进行中考试 0 个；生产锁文件与本地锁文件 SHA-256 一致。
- 停止 PM2 后使用 SQLite 原生备份生成 `/www/backups/prod-20260810-002116-before-problem-hover.db`。
- 备份大小：`6,885,376` 字节；SHA-256：`44023c1117e3aaa5015d1e8fb122cefac6b22b3d57319d3c515a2a1f758d9071`；完整性检查为 `ok`。
- 旧版本保留在 `/www/oj-old-20260810-002116-problem-hover`，可按 `docs/deploy.md` 回滚。
- `prisma migrate deploy` 确认无待执行迁移；PM2 `oj` 恢复为 `online`，端口仅监听 `127.0.0.1:3000`。
- 发布前后关键行数一致：用户 30、题目 1,370、提交 1,558、考试 0、考试记录 0、作业 1。

## 上线验证与清理

- 直连 upstream 与正式域名各连续 5 次健康检查均为 `ok/database=ok`。
- 正式 CSS 资源为 `/_next/static/chunks/1jfg7akq9krvy.css`；直连和 Nginx 返回内容一致，含新悬停类与目标颜色。
- `/ac-success.png` 返回 `200 image/png`；未登录访问 `/student/problems` 仍以 307 跳转 `/login`。
- Docker Judge 在无网络、只读根文件系统、内存/CPU/PID/capability 限制下完成 C++ 编译运行，输出 `42`。
- 最近 500 条 Nginx 访问记录中 504 为 0，最近 upstream 错误为 0；受控健康、登录、CSS 和权限跳转请求未新增应用错误日志。
- 服务器上传包和临时部署脚本已删除；生产数据库备份和旧版本目录保留。本地只保留已审计发布包，构建、解包、隔离库和测试脚本均已清理。
- 本机命令行 DNS 受本地代理 Fake-IP 影响，直接 TLS 探测未作为上线判据；生产直连 upstream 与正式域名 Nginx 链路的对照验证均已通过。
