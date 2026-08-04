# 2026-08-04 间歇性 504 与 AC 图片优化器修复记录

本文记录 2026-08-04 对线上 OJ 间歇性 504 的排查、修复、发布和验收。文档不记录任何真实密码、Token、Cookie 或 `.env` 内容。

## 1. 故障现象

- Nginx 间歇返回 504，等待时间约 60 秒。
- PM2 中 `oj` 仍显示 `online`，`127.0.0.1:3000` 也仍在监听，但直连 `http://127.0.0.1:3000/api/health` 同样超时。
- 两次冻结都紧随编程题提交为 `Accepted` 后的 AC 提示图请求出现；对应时间为 2026-08-02 19:59 和 2026-08-04 14:25。
- 提交记录已正常写入，故障集中在 Accepted 后的页面资源请求，不是 Judge 未完成或 SQLite 写入失败。

## 2. 根因与证据边界

两次故障前，Nginx 访问日志都出现了同一请求：

```text
/_next/image?url=%2Fac-success.png&w=3840&q=75
```

`ProblemSubmitForm.tsx` 当时使用 Next.js `Image` 加载 `public/ac-success.png`。默认行为会把这张固定的本地透明 PNG 改写到 `/_next/image` 按需优化接口。生产环境收到该请求后，Next 进程仍存活但不再响应健康检查，随后由 Nginx 返回 504。

排查同时确认：

- 故障时 CPU、可用内存、swap 和磁盘空间没有耗尽，不能归因于服务器整体资源打满。
- 直连 Next 的健康检查也超时，因此 Nginx 只是返回上游超时，不是故障源。
- 原图可直接读取，独立图片转换也能完成，不能归因于 PNG 损坏。
- 两次独立冻结都与同一图片优化请求严格相邻，绕过该接口后故障不再复现。

因此，本次已确认的生产触发路径是“AC 图片进入 Next.js 按需图片优化接口”。Next.js/Sharp 内部的具体阻塞点没有在独立环境中进一步证明，不把它写成已确认的底层死锁。

## 3. 修复内容

修复仅涉及 `src/components/ProblemSubmitForm.tsx` 中的 AC 图片：

```tsx
<Image
  alt="你通过了此题，恭喜"
  height={1254}
  src="/ac-success.png"
  unoptimized
  width={1254}
/>
```

`unoptimized` 保留 Next.js Image 的尺寸、替代文本和布局能力，但浏览器直接请求 `/ac-success.png`，不再经过 `/_next/image`。

本次没有修改：

- AC 遮罩 portal、透明效果、自动消失或点击关闭行为。
- Judge、提交队列、数据库结构、题目数据或提交记录。
- 依赖版本、Next.js 全局图片配置或其他页面图片。

`pm2 restart oj --update-env` 只能解除已经冻结的进程，是临时恢复动作；永久修复仍是发布上述代码变更。

## 4. 发布与数据保护

主工作区当时存在其他尚未发布的功能改动。生产包使用干净版本加这一行热修复单独构建，没有把未完成业务改动带入线上。

- 构建环境：Linux、Node.js 20.20.2、OpenSSL 3、单 worker。
- 本地检查：84 个测试文件、447 项测试通过；TypeScript、Lint 和生产构建通过。
- 发布包：54,316,044 字节，SHA-256 `94d1f8116a63df27f794415579d662980a11011c19dd5b38fd0147e0b64cf7a4`。
- 包审计：不含任何层级的 `.env`、数据库、根 `node_modules`、`.next/cache` 或嵌套压缩包；包含静态资源、`public/ac-success.png` 和 OpenSSL 3 Prisma 引擎。

生产回滚点：

```text
数据库备份：/www/backups/prod-before-20260804-152207-ac-image-hotfix.db
旧版本目录：/www/oj-old-20260804-152207-ac-image-hotfix
```

数据库备份和上线库的 SQLite `quick_check` 均为 `ok`。13 个迁移已全部应用，没有执行 `npm run seed` 或 `npm run db:init`。切换前后业务计数一致：用户 29、题目 1,350、提交 1,484、专项练习 1。

## 5. 线上验收

- PM2 `oj` 在线，应用只监听 `127.0.0.1:3000`。
- 直连 Next 和经 Nginx 的 `/api/health` 均正常；连续 20 次健康检查和额外 30 秒观察未出现超时。
- 登录页及其实际 CSS/JS 静态资源返回 200。
- `/ac-success.png` 直接返回 200；浏览器网络请求不再出现针对该图片的 `/_next/image` 请求。
- Docker Judge 冒烟编译运行成功，输出为 `42`。
- 发布后的 Nginx 访问日志没有新增 504，PM2 错误日志没有新增异常。

## 6. 长期维护规则

- `public/ac-success.png` 是固定本地透明图，`ProblemSubmitForm.tsx` 必须保留 `unoptimized`，或使用等价的直接静态加载；禁止重新让它进入 `/_next/image`。
- PM2 `online` 和端口仍在监听不代表应用能响应。间歇 504 必须先直连 `/api/health`，再判断是 Nginx 还是 Next 上游故障。
- 如果日志再次出现 Accepted 后紧随 `/_next/image?url=%2Fac-success.png`，不要在生产环境手动重放该可疑地址，以免再次冻结服务。
- 重启恢复后仍要走标准 Linux standalone 发布流程，并验证健康接口、实际静态资源、AC 图片直连和 Judge，不能只看 PM2 状态。

通用诊断命令和发布验收项已同步到 [部署说明](deploy.md)。AC 动效的原始上线与 portal 约束见 [2026-06-13 编辑器字号与 AC 弹窗上线记录](ops-review-2026-06-13.md)。
