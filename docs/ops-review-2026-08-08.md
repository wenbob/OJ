# 2026-08-08 正式域名同步与首次 AC 图片预加载记录

本文记录 `botcode.work` 正式入口同步、生产运行时加固和首次 Accepted 图片加载修复。文档不包含真实密码、API Key、Cookie、证书通知邮箱或 `.env` 内容。

## 1. 本次范围

- 正式入口统一为 `https://botcode.work`，HTTP、HTTP IP 和 `www.botcode.work` 保留路径与参数后跳转到主域名。
- 生产环境增加 `APP_ORIGIN=https://botcode.work`、`SESSION_COOKIE_SECURE=true` 和 `OJ_LISTEN_HOST=127.0.0.1`；删除无代码引用的旧 IP 站点变量。
- 生产环境校验拒绝非公网 HTTPS Origin、带路径/参数/端口的 Origin，以及显式关闭 Secure Cookie。
- Nginx 模板补充主域名、`www`、ACME Webroot、长时间 AI 路由、真实转发头和一天 HSTS 的明确配置。
- 新增安全更新域名环境变量、安装 ACME 临时配置和证书续期后校验 Nginx 的脚本。
- 答题页挂载后复用一个原生 `Image` 请求预加载 `/ac-success.png` 并等待 `decode()`；首次 Accepted 只有在图片可绘制后才开始原有 1 秒动效。加载失败或 5 秒超时使用 Accepted 文字反馈。
- AC 图片继续直接请求静态文件并保留 `unoptimized`，禁止重新进入 `/_next/image`，避免复发 2026-08-04 的 Next 上游冻结和 504。

本次没有数据库结构、题目数据、Judge 规则或业务 API 变更。

## 2. 生产同步与回滚点

- 发布前数据库备份：`/www/backups/prod-20260808-161756-before-botcode-domain-sync.db`。
- 旧版本目录：`/www/oj-old-20260808-161756-botcode-domain-sync`。
- 服务器继续使用本地 Linux standalone 产物，未在 2 核 2GB 服务器执行 `npm ci`、Next.js 构建、`seed` 或 `db:init`。
- PM2 `oj` 在线，应用只监听 `127.0.0.1:3000`；云安全组已移除公网 3000，未触碰其它站点使用的端口和资源。

## 3. 域名与证书现状

- 根域名 A 记录和 `www` CNAME 已生效，正式 HTTPS 与跳转链路可用。
- 当前双域名证书覆盖 `botcode.work` 和 `www.botcode.work`，有效期到 2026-11-05；在自动证书完成前继续保留该证书和 Nginx 回滚配置。
- Certbot 账号与定时器已准备，但服务器外部的 HTTP-01 请求被阿里云 `Server: Beaver` 返回 `403 Non-compliance ICP Filing`，因此尚未生成 Let’s Encrypt 证书 lineage，`certbot renew --dry-run` 也不能作为已完成项。
- 后续必须先完成 ICP 备案，再执行 Webroot 双域名签发与 dry-run；或者由用户明确授权最小权限的阿里云 DNS-01 凭据。禁止反复重试 HTTP-01、使用主账号 AccessKey，或把 DNS 凭据写入项目 `.env` 和 Git。

## 4. 验证结果

- 直连 `127.0.0.1:3000/api/health` 与公网 `https://botcode.work/api/health` 各连续检查 20 次均正常，没有新增 504。
- HTTPS 登录页、实际 CSS/JS、`/ac-success.png` 和域名跳转正常；AC 图片未产生 `/_next/image` 请求。
- 登录 Cookie 使用 `Secure`、`HttpOnly` 和 `SameSite=Lax`。
- PM2 自启动状态正常，应用只绑定回环地址，Docker Judge 与生产数据库保持原有运行方式。
- 本地定向测试、完整测试、TypeScript、Lint、Windows 受限构建、WSL Linux standalone 构建和发布包敏感文件审计均通过。

## 5. 长期维护规则

- `deploy/nginx/oj.conf` 是 Let’s Encrypt 成功后的最终模板；证书文件不存在时不能直接覆盖当前线上配置。
- 当前有效证书和回滚配置只能在双域名自动证书、续期 timer 与 `certbot renew --dry-run` 全部验证后再清理。
- 生产域名、Secure Cookie、回环监听和 AC 图片直接静态请求属于发布验收必查项。
- 首次 Accepted 必须使用清空浏览器缓存的真实冒烟测试，不能只验证第二次命中缓存后的效果。
