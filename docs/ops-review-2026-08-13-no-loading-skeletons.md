# 2026-08-13 全角色灰色骨架等待页移除与生产发布记录

## 发布范围

生产功能提交为：

```text
316c4977077f02cbed714cc5306c095aa22f96f6  perf: remove route loading skeletons
```

- 删除学生普通页面、学生正式考试、老师端和管理员端共 26 个 `loading.tsx`，并删除共享 `RouteLoadingSkeleton`。
- 删除只服务于等待骨架的 `.route-loading-skeleton`、`.skeleton-shimmer` 及闪烁动画；生产源码中相关标识和 `[data-route-loading]` 均为 0。
- 页面切换期间保留当前页面，目标页面完成后一次性替换；超过 `100ms` 时只在当前 `NavigationLink` 旁显示非阻断小圆点。
- 保留持久化 `AppShell`、`180ms / 4px` 内容入场、减少动态效果支持，以及表单、开考和交卷按钮自身的处理中状态。
- 学生首页取消局部 `Suspense` 灰块，段位、排名、学情和基础数据改为页面顶层并行读取后统一显示。

本次没有公开 API、路由地址、数据库结构、迁移、依赖、权限、考试、Judge、AI 或备案页脚行为变更。

## 本地验证与 Linux 发布包

- `npm run test`：108 个测试文件、584 项测试通过。
- `npx tsc --noEmit`、`npm run lint` 和 `npm run build` 全部通过。
- `npm run test:e2e`：7 项 Playwright 用例通过，覆盖学生、老师、管理员、正式考试、400ms 慢导航、旧页面保留、小圆点反馈、无灰色骨架和持久页头。
- 在本地 Linux/Docker 环境使用 2 CPU、2GB 内存、单 Next worker 和 1GB Node 堆完成 Ubuntu standalone 构建；空 SQLite 成功应用全部 17 项迁移，standalone 健康检查为 HTTP 200。
- 发布包：`tmp/release-316c497-20260813-no-skeleton/oj-release-316c497-linux-x64.tgz`。
- 大小：`55,310,933` 字节；SHA-256：`c8f2dbcfb2572513d35b332e81bd3f6eab3bfff47388f0dcf9307829c3deba87`。
- 归档共 5,675 个条目；环境文件、真实数据库、根 `node_modules`、`.next/cache`、嵌套压缩包和路径穿越条目均为 0。standalone 已包含静态资源、`public` 和唯一的 OpenSSL 3 Prisma 引擎。

## 生产预检、发布与恢复点

- 发布前确认 PM2 `oj`、直连与公网健康检查正常，SQLite `quick_check` 为 `ok`，17 项迁移全部完成，进行中考试为 0。
- 发布时间：`2026-08-13 12:40:35 +08:00`。
- 数据库备份：`/www/backups/prod-20260813-124035-before-no-skeleton.db`，大小 `6,946,816` 字节，SHA-256 为 `fdbb7b157bd55186c3655c5597eaf2c50e89ecf4a17cb98c8c9137bcfa7c9923`，完整性检查为 `ok`。
- 应用回滚目录：`/www/oj-old-20260813-124035-no-skeleton`。
- 依赖锁文件未变化，发布沿用生产根 `node_modules`；服务器没有执行依赖安装、Next.js 构建、`npm run seed`、`npm run db:init` 或 Docker 全局清理。
- 切换前后数据量一致：用户 31、题目 1,370、提交 1,570、考试 0、考试记录 0、专项练习 1。

## 上线验收与清理

- PM2 `oj` 在线，应用目录为 `/www/oj`，服务只监听 `127.0.0.1:3000`；切换后的直连与公网健康检查正常，公网健康接口随后连续 5 次返回 HTTP 200 和数据库 `ok`。
- 登录页返回 HTTP 200，继续展示 `陕ICP备2026021441号-1`；ICP备案功能未被本次视觉调整影响。
- 登录页保持 `private/no-store`；实际 CSS 和 JavaScript 返回 HTTP 200，CSS 启用 gzip，哈希静态资源使用一年 immutable 缓存，并保留 HSTS 与 `nosniff`。
- 未登录管理员设置接口返回 401，学生页面返回 307 并跳转 `/login`；`/ac-success.png` 继续返回 HTTP 200。
- 生产源码及发布归档中的 `loading.tsx` 数量均为 0，`RouteLoadingSkeleton` 不存在，生产源码中的骨架专用标识为 0。
- 本次未改 Judge；发布前确认 Docker Judge 镜像存在，切换前后 `Submission` 均为 1,570 条，没有为视觉发布写入测试提交。
- 服务器上传包已删除，`/www/oj-new` 不存在；保留已校验的数据库备份和旧应用目录作为恢复点。
- `origin/main`（`wenbob/OJ`）与 `oj2026/main`（`wenbob/2026-OJC`）先同步功能提交，文档收尾提交随后同步到两端 `main`。
