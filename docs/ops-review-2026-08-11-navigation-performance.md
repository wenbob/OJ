# 2026-08-11 全站页面切换流畅度优化与生产发布记录

## 发布范围

生产运行产物包含两个提交：

```text
824ba4e9a0a2a2f08d71b9442c159f255ed5d803  perf: improve navigation feedback
0d03994235c33cc758091a48e38e045785c878cd  perf: persist role shells and stream slow data
```

- 普通页面入场从最长约 `660ms` 的分段动画收敛为统一 `180ms`、`4px` 位移且无分段延迟；保留题目行、按钮、天梯和 AC 专用动效，并继续支持减少动态效果设置。
- 新增 `NavigationLink`：主导航、分页和高频筛选在导航超过 `100ms` 时显示轻量等待状态和 `aria-busy`，不使用全屏遮罩，也不阻断继续操作。
- 管理员、老师和学生普通页面增加角色级及细分路由骨架；题库和提交列表使用表格骨架，题目详情和考试练习使用双栏骨架。
- `AppShell` 上移到管理员、老师和学生普通区的持久布局。同角色切页只替换主体；学生正式答题使用独立 `(exam)` 路由组和锁定外壳，公开 URL、离开交卷和刷新交卷规则不变。
- 清理表单和考试动作中跳转后立即 `refresh()` 的重复导航；一次开始考试或交卷只产生一次 RSC 导航请求。
- 认证、公共设置和学生首页读取并行化，只使用 React `cache()` 做单次请求内去重，不跨请求缓存权限、考试或提交状态。根布局直接把公共设置传给 `BrowserIdentity`，取消首次加载额外的 `/api/settings/public` 请求。
- 学生首页的段位、排名、学情和个性化入口使用细粒度 `Suspense` 流式补齐；专项练习强提醒数据仍在基础页面返回前完成判断。
- 天梯统计改为数据库 `groupBy` 聚合；后台首页直接统计学生数；分类列表按分类聚合；最近 Accepted 记录在数据库侧有界选取。
- Nginx 启用 upstream 连接复用、gzip、哈希静态资源直出与一年 immutable 缓存；动态页面和 RSC 保持私有且不缓存。应用发送 `X-Accel-Buffering: no`，支持自托管流式响应。

本次没有公开 API、路由地址、数据库结构、迁移、依赖、权限、考试、Judge 或 AI 行为变更。

## 本地验证与 Linux 发布包

- `npm run test`：106 个测试文件、572 项测试通过。
- `npx tsc --noEmit`、`npm run lint` 和 `npm run build` 全部通过。
- `npm run test:e2e`：5 项 Playwright 用例通过。导航专项覆盖 400ms 人工 RSC 延迟、100ms 后反馈、内容骨架、页头可交互、三种角色外壳持久、正式考试无普通导航闪现、开始与交卷各一次 RSC，以及减少动态效果模式。
- 在本地 Linux/Docker 环境完成 Ubuntu standalone 构建；服务器未执行 `npm ci` 或 Next.js 构建。
- 发布包：`tmp/release-0d03994-20260811-navigation/oj-release-0d03994-linux-x64.tgz`。
- 大小：`46,943,897` 字节；SHA-256：`cb2b3bf3dfb0ea620642b23cd859f38b0aab1cfc00d2ad95aecc2bc3f0dee3ac`。
- 归档共 3,793 个条目；环境文件、数据库、根 `node_modules`、`.next/cache`、嵌套压缩包、私钥和路径穿越条目均为 0。standalone 已包含静态资源、`public` 和唯一的 OpenSSL 3 Prisma 引擎。

## 生产预检、发布与恢复点

- 发布前确认 PM2、直连和公网健康检查正常，SQLite `quick_check` 为 `ok`，17 项迁移全部完成，进行中考试和有效考试窗口均为 0。
- 发布时间：`2026-08-11 18:41:18 +08:00`。
- 数据库备份：`/www/backups/prod-20260811-184118-before-navigation.db`，大小 `6,934,528` 字节，SHA-256 为 `2b81018d7aef6711c3a77fa546103d6891df57acc461916b9751f9b48a148199`，完整性检查为 `ok`。
- 应用回滚目录：`/www/oj-old-20260811-184118-navigation`。
- Nginx 变更前备份：`/etc/nginx/sites-available/oj.before-navigation-20260811-184227`，SHA-256 为 `4f61c69e08376e744505c31f0bb605867fa11fc6aad3f7cdaa2023322b229986`。
- 生效 Nginx 配置 SHA-256 为 `0aec42f19db061999674d59ccba87f5f082e9fbdeb16fb821f941c4cbe20cfc2`。生产继续使用有效的阿里云证书 `/etc/nginx/ssl/botcode.work/botcode.work.pem` 与 `.key`；没有用仓库模板中的 Let’s Encrypt 路径覆盖证书。
- 服务器没有执行 `npm run seed`、`npm run db:init`、依赖安装、Next.js 构建或 Docker 全局清理。

## 上线验收与清理

- PM2 `oj` 在线，应用目录为 `/www/oj`，服务只监听 `127.0.0.1:3000`；直连和公网健康检查连续正常。
- 生产库 `quick_check` 为 `ok`，累计 17 项迁移；核对时数据为用户 30、题目 1,370、提交 1,565、考试 0、考试记录 0、专项练习 1。
- 登录页和 RSC 响应保持私有且不缓存；实际 CSS 使用 gzip 和一年 immutable 缓存。直连 Next 返回 `X-Accel-Buffering: no`；该头被 Nginx 消费，因此公网不回显属于预期。
- HTTP、HTTP IP 和 `www` 继续保留 URI 后跳转到 `https://botcode.work`；TLS 与安全响应头正常。
- 未登录调用管理员接口返回 401；受限 Docker Judge 冒烟输出 `OJ_NAV_SMOKE:42`，试运行前后 `Submission` 均为 1,565 条。
- 最近 500 条 Nginx 访问记录没有 5xx/504，PM2 没有当前错误；服务器上传包已删除，`/www/oj-new` 不存在。数据库、应用和 Nginx 三个恢复点继续保留。
- `origin/main`（`wenbob/OJ`）和 `oj2026/main`（`wenbob/2026-OJC`）均已快进到 `0d03994235c33cc758091a48e38e045785c878cd`。
