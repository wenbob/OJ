# 2026-07-01 头衔天梯与安全加固上线记录

## 上线范围

本次把本地已验证的学生头衔/段位天梯功能和安全加固一起发布到线上 `/www/oj`。功能与修复包括：

- 学生首页展示段位积分进度；学生端和管理员端天梯榜已上线。
- 管理员可给学生设置最多 20 字自定义头衔；自定义头衔只影响展示，不影响积分和排名。
- 客观题提交结果对学生隐藏标准答案。
- 登录失败限流、会话有效期、同源变更请求校验、请求体大小限制、Judge 队列上限和进程输出上限已生效。
- `/api/health` 不再返回 `judgeMode` 或环境错误详情，只返回健康状态、数据库状态和时间戳。
- 全局基础安全响应头已生效。
- 依赖升级到 `next@16.2.9`，并用 `overrides` 固定 `dompurify@3.4.11`、`postcss@8.5.13`；`npm audit --omit=dev` 为 0 漏洞。

## 发布方式

没有在 2 核 2GB 线上服务器执行 Next.js 构建。本次仍采用本地 Linux/Docker 环境生成 Next.js standalone 产物后上传：

1. 本地 Linux 容器内执行 `npm ci` 和 `npm run build`。
2. 将 `.next/static` 复制到 `.next/standalone/.next/static`，将 `public` 复制到 `.next/standalone/public`。
3. 打包上传 `/www/oj-release.tgz`。
4. 服务器解包到 `/www/oj-new`，复制线上 `.env` 和生产库副本。
5. 因 `package-lock.json` 发生变化，在 `/www/oj-new` 执行 `npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund`。
6. 在生产库副本上执行 `npm run check:env` 和 `npm run db:deploy`。
7. 构建/确认 `oj-cpp-judge` Docker 镜像。
8. 备份生产库后切换 `/www/oj` 目录并重启 PM2。

## 备份与回滚点

上线前备份：

```text
/www/backups/prod-20260629-180816-before-ranking-security-deploy.db
```

切换后旧目录：

```text
/www/oj-old-20260629-181058
```

如果需要回滚，先停止 `oj`，把当前 `/www/oj` 改名保留，再把上述旧目录恢复为 `/www/oj`，最后 `pm2 restart oj --update-env` 并检查 `/api/health`。

## 验证结果

上线后确认：

- `pm2 list` 中 `oj` 为 `online`。
- 本机和公网 `/api/health` 返回 `{"ok":true,"database":"ok","timestamp":"..."}`。
- `_next/static` 静态资源返回 `200 OK`。
- `/www/oj/.env` 中 `DATABASE_URL` 为 `file:/www/oj/prisma/prod.db`。
- `/www/oj/package.json` 中 `next` 为 `16.2.9`，`eslint-config-next` 为 `16.2.9`。
- 安全响应头包含 `Content-Security-Policy`、`Referrer-Policy`、`X-Content-Type-Options`、`X-Frame-Options` 和 `Permissions-Policy`。
- 数据库迁移结果为 `No pending migrations to apply`。

上线后删除了临时上传包：

```text
/www/oj-release.tgz
```

## 注意事项

- 新版 `/api/health` 不再展示 `judgeMode`；运维检查 Judge 模式时用 `.env`、`npm run check:env` 或 PM2 环境确认。
- PM2 error log 里可能仍有旧版本历史错误，例如曾经的 SQLite 相对路径问题或部署切换期间旧页面 Server Action 失效；判断当前是否异常时应结合新请求后的日志增量。
- 浏览器中保留的部署前旧页面如果出现 Server Action 失效，刷新页面即可。
