# OJ 平台线上部署与维护手册

本文档用于小规模正式部署和后续维护。当前线上环境为阿里云 ECS，项目目录约定为 `/www/oj`。

## 1. 服务器信息

当前线上服务器配置：

- 系统：Ubuntu 22.04.5 LTS
- 配置：2 核 CPU、2GB 内存、40GB 系统盘、3M 固定带宽
- 项目目录：`/www/oj`
- 对外访问：`http://39.105.91.81`

已安装组件：

- Node.js v20.20.2
- npm 10.8.2
- Docker 29.1.3
- PM2 7.0.1
- Nginx 1.18.0

生产环境建议只开放：

- `22`：SSH
- `80`：HTTP
- `443`：HTTPS，后续配置证书后使用

完成 Nginx 反向代理后，建议关闭安全组中的 `3000` 对外访问。

## 2. 首次部署流程

如果服务器可以稳定访问 GitHub：

```bash
cd /www
git clone https://github.com/wenbob/OJ.git oj
cd /www/oj
```

如果服务器访问 GitHub 不稳定，可以使用本地压缩包上传，见本文档“后续更新流程”。

安装依赖：

```bash
npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
```

复制环境变量文件：

```bash
cp .env.example .env
nano .env
```

生产环境 `.env` 至少包含：

```env
NODE_ENV=production
DATABASE_URL="file:/www/oj/prisma/prod.db"
SESSION_SECRET="请替换成至少 32 位的强随机字符串"
JUDGE_MODE=docker
JUDGE_DOCKER_IMAGE=oj-cpp-judge
JUDGE_CONCURRENCY=1
JUDGE_TIME_LIMIT_MS=2000
JUDGE_MEMORY_LIMIT_MB=128
JUDGE_COMPILE_TIMEOUT_MS=45000
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
ARK_API_KEY=
AI_CUSTOM_API_KEY=
```

不要把 `.env` 提交到 Git，也不要把真实密码或真实 secret 写进文档。

AI 密钥按服务商分别放在 `DEEPSEEK_API_KEY`、`ARK_API_KEY`、`AI_CUSTOM_API_KEY`。缺少未使用服务商的密钥不会影响 OJ 启动；管理员页面只显示当前密钥槽是否已配置。

生产环境使用 SQLite 时，`DATABASE_URL` 必须使用绝对路径。不要写 `file:./prod.db`；standalone 运行时会把相对路径解析到 `.next/standalone/node_modules/.prisma/client/` 附近，可能连到空数据库，导致登录接口报 `main.User does not exist`。

检查环境变量：

```bash
npm run check:env
```

应用数据库迁移：

```bash
npm run db:deploy
```

首次初始化数据库时可以运行一次 seed：

```bash
npm run seed
```

线上初始化后不要重复执行 `npm run seed`。重复 seed 可能重置线上数据，影响用户、题目、考试和提交记录。

构建 Docker Judge 镜像：

```bash
docker build -t oj-cpp-judge ./docker/judge-cpp
```

构建 Next.js：

```bash
NEXT_TELEMETRY_DISABLED=1 NEXT_PRIVATE_BUILD_WORKER_COUNT=1 NODE_OPTIONS='--max-old-space-size=768' npm run build
```

启动服务：

```bash
pm2 start npm --name oj -- run start
pm2 save
```

`npm run start` 会先执行生产环境变量检查，再通过 `scripts/load-env.mjs` 预加载 `.env`，最后使用 Next.js standalone 服务启动。

如果需要配置 PM2 开机自启：

```bash
pm2 startup
```

按命令输出执行生成的 systemd 命令，然后再次执行：

```bash
pm2 save
```

### AI 服务商与模型配置

如果要在生产环境启用 AI，需要在 `/www/oj/.env` 中为将使用的服务商配置对应密钥：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
ARK_API_KEY=
AI_CUSTOM_API_KEY=
```

注意：

- API Key 只能放在服务器 `.env`，不要提交到 Git、数据库、管理页面或前端代码。修改密钥后使用 `pm2 restart oj --update-env` 重新加载。
- 管理员在 `/admin/settings` 分别维护“编程题 AI”和“选择判断 AI”两套非敏感配置。编程题配置用于学生助手及教师学情摘要，选择判断配置用于后台客观题解析；两套配置可以选择不同服务商、模型和思考模式。
- DeepSeek 固定访问 `https://api.deepseek.com`，豆包固定访问 `https://ark.cn-beijing.volces.com/api/v3`。自定义 Base URL 在生产环境必须是公共 HTTPS，且不能带 URL 凭据、查询参数或片段。
- 自定义上游请求会固定 DNS 解析地址并禁止重定向；本机、内网、链路本地、保留网络和云元数据地址都会被拒绝。开发环境只额外允许 HTTP loopback 调试。
- 所有学生 AI 请求必须经过 `/api/ai/problem-assist`，浏览器不能直接调用上游服务；模型发现只能由管理员接口调用。
- AI 使用“双重开关”：学生个人 AI 权限与日常练习/当前考试 AI 开关必须同时开启；任一关闭时学生端隐藏整个 AI 面板，服务端也会拒绝请求。
- 学生选择判断题不开放 AI 助手，避免泄露答案。管理员和老师校题使用独立的 `aiObjectiveExplanationEnabled` 开关（默认关闭）；开启后解析按题目小题写入数据库共享缓存，题面、标准答案或模型配置变化时自动失效，且不计入学生 AI 使用统计。
- 服务端按角色和题型读取 5–600 秒的管理员配置：学生编程默认 20 秒，老师/管理员学情摘要及选择判断解析默认 30 秒。有效缓存和幂等重放不计时，真正开始上游请求后即使失败也会进入对应间隔。
- AI 请求超时为 240 秒，输出预算为 4096 tokens；对推理未完成或输出不合格的结果返回友好错误，不把内部推理内容交给学生。
- 新学生端使用 SSE 接收思考心跳和安全回复片段，旧客户端 JSON 响应继续兼容；回复必须先通过完整安全清洗，不能直接透传上游原始 token。
- AI 请求进入实际处理后会写入 `AiConversation` / `AiConversationTurn`，供管理员查看使用量和学生可见问答；缓存命中不会虚增模型调用或 Token。
- 审计记录不保存代码、完整 Prompt、客户端历史、隐藏测试点、内部推理、API Key 或请求头；默认保留 180 天，可在系统设置改为 30、90、365 天或永久。

## 3. Docker Judge 镜像说明

当前 Judge 镜像使用 Ubuntu 22.04，并切换到阿里云 Ubuntu 软件源，避免部分服务器拉取 Docker Hub `gcc:13` 超时：

```dockerfile
FROM ubuntu:22.04

RUN sed -i 's@http://archive.ubuntu.com/ubuntu/@http://mirrors.aliyun.com/ubuntu/@g' /etc/apt/sources.list \
    && sed -i 's@http://security.ubuntu.com/ubuntu/@http://mirrors.aliyun.com/ubuntu/@g' /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends g++ make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
```

构建命令：

```bash
docker build -t oj-cpp-judge ./docker/judge-cpp
```

检查镜像：

```bash
docker images oj-cpp-judge
```

检查 Docker daemon：

```bash
docker info
```

生产环境必须使用：

```env
JUDGE_MODE=docker
```

不要在生产环境使用 local Judge。

如果学生提交显示 `Docker 编译超时`，通常是小规格服务器在 Docker 冷启动和 g++ 编译时超过了编译超时阈值。可以在 `.env` 中适当调大：

```env
JUDGE_COMPILE_TIMEOUT_MS=45000
```

修改后重启服务：

```bash
pm2 restart oj --update-env
```

## 4. Nginx 反向代理

示例配置：

```nginx
server {
    listen 80;
    server_name 39.105.91.81;
    client_max_body_size 25m;

    # AI 难题允许较长推理；不要沿用 Nginx 默认 60 秒读取超时。
    location = /api/ai/problem-assist {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Nginx 是唯一受信任代理，不能把客户端伪造的 XFF 继续传给应用。
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

检查配置：

```bash
nginx -t
systemctl reload nginx
```

配置完成后访问：

```text
http://39.105.91.81
```

## 5. 健康检查

服务启动后检查：

```bash
curl http://127.0.0.1:3000/api/health
curl http://39.105.91.81/api/health
```

期望返回类似：

```json
{"ok":true,"database":"ok","timestamp":"..."}
```

健康接口只暴露服务和数据库状态，不再返回 Judge 模式或环境错误详情。生产 Judge 模式必须通过 `.env`、`npm run check:env` 或 PM2 环境确认，正式使用必须保持 `JUDGE_MODE=docker`。

基础安全响应头检查：

```bash
curl -fsSI http://127.0.0.1:3000/login | grep -Ei 'content-security-policy|x-content-type-options|x-frame-options|referrer-policy|permissions-policy'
```

## 6. SQLite 数据备份

当前线上数据库通常位于：

```text
/www/oj/prisma/prod.db
```

手动备份：

```bash
mkdir -p /www/backups
cp /www/oj/prisma/prod.db /www/backups/prod-$(date +%Y%m%d-%H%M%S).db
```

查看备份：

```bash
ls -lh /www/backups
```

建议至少每天备份一次。可以后续通过 `cron` 增加自动备份：

```bash
crontab -e
```

示例：

```cron
0 2 * * * mkdir -p /www/backups && cp /www/oj/prisma/prod.db /www/backups/prod-$(date +\%Y\%m\%d-\%H\%M\%S).db
```

恢复数据库前应先停止服务：

```bash
pm2 stop oj
cp /www/backups/某个备份.db /www/oj/prisma/prod.db
pm2 start oj
```

## 7. 常用维护命令

查看服务状态：

```bash
pm2 status
pm2 logs oj
```

重启服务：

```bash
pm2 restart oj
```

查看端口：

```bash
ss -lntp | grep 3000
```

查看 Docker：

```bash
docker info
docker images
docker ps -a
```

检查数据库迁移：

```bash
npm run db:status
```

部署新版本优先使用“本地 Linux/Docker 构建 standalone 产物后上传”的流程，见“后续更新流程”。只有本地 Linux 产物确实无法生成、依赖没有变化且已安排维护窗口时，才允许在服务器当前目录执行下面的应急低内存流程；依赖变化时不要在 2GB 服务器运行 `npm ci`：

```bash
mkdir -p /www/backups
stamp=$(date +%Y%m%d-%H%M%S)
pm2 stop oj
cp /www/oj/prisma/prod.db /www/backups/prod-${stamp}.db
test -s /www/backups/prod-${stamp}.db
npm run check:env
NEXT_TELEMETRY_DISABLED=1 NEXT_PRIVATE_BUILD_WORKER_COUNT=1 NODE_OPTIONS='--max-old-space-size=768' npm run build
npm run db:deploy
pm2 restart oj --update-env
curl http://127.0.0.1:3000/api/health
```

当前 2 核 2GB 服务器资源有限。在 `/www/oj` 当前线上目录应急构建时，必须先停 PM2、备份并验证数据库，再低内存构建，避免构建和线上 Node 进程同时争抢内存导致 SSH、HTTP 短暂卡住。低内存构建固定使用：

```bash
NEXT_TELEMETRY_DISABLED=1 NEXT_PRIVATE_BUILD_WORKER_COUNT=1 NODE_OPTIONS='--max-old-space-size=768' npm run build
```

不要把 `/www/oj-new` 当作常规服务器构建目录。常规发布只在该目录解包本地 Linux standalone 产物、复制线上环境和依赖并做切换预检。

### 清理 OJ 旧版本目录

磁盘空间不足时，先确认当前服务健康，再只清理 OJ 明确路径。不要扫描或删除其它网站目录。

只读检查：

```bash
df -h /
free -h
du -sh /www/oj /www/oj-old-* /www/oj-new /www/oj-release.tgz /www/oj.zip 2>/dev/null || true
ls -lh /www/backups/prod-*.db 2>/dev/null || true
docker system df
curl http://127.0.0.1:3000/api/health
pm2 list
```

可以清理的 OJ 残留：

- 已确认不再需要回滚的 `/www/oj-old-*`。
- 失败发布残留的 `/www/oj-new`。
- OJ 发布压缩包 `/www/oj-release.tgz` 或历史 `/www/oj.zip`。

执行删除前先打印目标：

```bash
find /www -maxdepth 1 -type d -name 'oj-old-*' -print | sort
ls -lh /www/oj-release.tgz /www/oj.zip 2>/dev/null || true
```

确认目标只包含 OJ 旧版本后再删除：

```bash
find /www -maxdepth 1 -type d -name 'oj-old-*' -exec rm -rf -- {} +
rm -f -- /www/oj-release.tgz /www/oj.zip
```

如果要删除 `/www/oj-new`，必须先确认它不是当前服务目录，且 `/www/oj` 健康：

```bash
test -d /www/oj
curl http://127.0.0.1:3000/api/health
rm -rf -- /www/oj-new
```

清理后复查：

```bash
df -h /
curl http://127.0.0.1:3000/api/health
curl http://39.105.91.81/api/health
pm2 list
```

Docker 注意事项：

- `docker system df` 是只读检查，可以执行。
- `docker system prune`、`docker builder prune` 是全局清理，可能影响同机股票系统的构建缓存；除非用户明确确认，否则不要执行。
- 做 OJ 清理时不要删除 `stock-fund-advisor*` 容器、镜像或相关目录。
- SQLite 备份通常很小，默认保留；确实要删旧备份时，先确认要保留的最新备份路径真实存在。

## 8. 安全收尾清单

上线后请逐项确认：

- [ ] 默认管理员密码已修改。
- [ ] 文档、代码、`.env.example` 中没有真实管理员密码。
- [ ] `.env` 没有提交到 Git。
- [ ] `prod.db` 没有提交到 Git。
- [ ] `node_modules` 没有提交到 Git。
- [ ] `.next` 没有提交到 Git。
- [ ] 阿里云安全组关闭公网 `3000` 端口。
- [ ] 安全组只保留必要端口：`22`、`80`、后续 `443`。
- [ ] 后续可以把 `22` 端口限制为固定 IP。
- [ ] 不开放任何数据库端口。
- [ ] Docker Judge 使用 `JUDGE_MODE=docker`。
- [ ] `/api/health` 返回正常。
- [ ] 登录页响应包含基础安全头：`Content-Security-Policy`、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`。
- [ ] 已完成一次 SQLite 备份。
- [ ] 后续可以绑定域名。
- [ ] 后续可以配置 HTTPS。

## 9. 上课前检查清单

- [ ] Docker Engine 正常：`docker info`
- [ ] PM2 进程正常：`pm2 status`
- [ ] 健康检查正常：`curl http://127.0.0.1:3000/api/health`
- [ ] 数据库已备份。
- [ ] 管理员可以登录。
- [ ] 学生账号可以登录。
- [ ] 编程题“运行样例”和“自定义输入”正常，试运行前后 `Submission` 数量不变。
- [ ] 简单题提交 Accepted。
- [ ] 今日考试已发布。
- [ ] 考试题目、时长、分值确认无误。

## 10. 故障排查

学生提交一直失败：

```bash
docker info
pm2 logs oj
curl http://127.0.0.1:3000/api/health
```

Docker Judge 镜像不存在或异常：

```bash
docker images oj-cpp-judge
docker build -t oj-cpp-judge ./docker/judge-cpp
pm2 restart oj
```

Nginx 无法访问：

```bash
nginx -t
systemctl status nginx
systemctl reload nginx
curl http://127.0.0.1:3000
```

数据库误操作：

1. 立即停止服务：`pm2 stop oj`
2. 从 `/www/backups` 按时间戳找到切换前生成的备份。
3. 复制回 `/www/oj/prisma/prod.db`
4. 重启服务：`pm2 start oj`

## 11. 后续更新流程

### 方案 A：本地 Linux standalone 包上传

本地确认代码已提交并通过检查后，在 Linux/Docker 环境构建生产产物，再打包上传。不要用 Windows 本机生成的 `.next/standalone` 作为 Ubuntu 服务器产物。

构建容器必须安装与生产机兼容的 OpenSSL 后再执行 `npm ci --include=dev`、`prisma generate` 和 `next build`。显式包含 devDependencies 是为了避免构建容器加载 `NODE_ENV=production` 后省略 Tailwind、TypeScript 等构建期依赖。当前 Ubuntu 生产机使用 OpenSSL 3；若使用 `node:22-bookworm-slim`，需先安装 `openssl`，否则 Prisma 可能退回生成 `debian-openssl-1.1.x` 引擎，上传后存在无法加载的风险。打包后应检查 standalone 中的实际引擎：

```bash
tar -tzf oj-release.tgz | grep 'libquery_engine'
# 当前生产环境应看到 libquery_engine-debian-openssl-3.0.x.so.node
```

发布包应包含源码、`public`、`prisma`、`scripts`、package 文件、`.next/standalone` 和 `.next/static`；必须排除 `.env`、`*.db`、SQLite 派生文件、`.next/cache`、仓库压缩包和 Windows 本机的根 `node_modules`。standalone 目录内的最小运行依赖是 Next.js 产物的一部分，可以保留。若 `package-lock.json` 已改变，必须另外包含同一次本地 Linux 构建生成的根 `node_modules`，不能复用旧服务器依赖。

不能只排除仓库根目录的 `.env`。Next 构建追踪可能把它复制为 `.next/standalone/.env`；发布前必须检查压缩包内的全部归档条目，发现任意层级的环境文件或数据库文件就停止上传：

```bash
if tar -tzf oj-release.tgz | grep -Eq '(^|/)\.env($|\.)|\.(db|db-wal|db-shm)$|^\./node_modules/|^\./\.next/cache/'; then
  echo "发布包包含禁止项"
  exit 1
fi
```

打包前必须把静态资源复制进 standalone 运行目录：

```bash
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static .next/standalone/public
cp -a .next/static .next/standalone/.next/static
cp -a public .next/standalone/public
```

缺少 `.next/standalone/.next/static` 时，登录页会返回 HTML，但 CSS/JS 请求 404，表现为页面无样式且登录无反应。

上传到服务器 `/www` 后，只在服务器执行解包、环境复制、预检和切换；常规发布不要在 2GB 服务器执行 `npm ci` 或 Next 构建：

```bash
cd /www
rm -rf /www/oj-new
mkdir -p /www/oj-new
tar -xzf /www/oj-release.tgz -C /www/oj-new
cp /www/oj/.env /www/oj-new/.env
# 仅当 package-lock.json 未变化且发布包没有根 node_modules 时复用旧依赖：
test -d /www/oj-new/node_modules || cp -al /www/oj/node_modules /www/oj-new/node_modules
cd /www/oj-new
npm run check:env
docker image inspect oj-cpp-judge >/dev/null
```

如果 `package-lock.json` 发生依赖变化，不要在 2GB 服务器热运行 `npm ci`。优先在本地 Linux/Docker 环境生成可用于 Ubuntu 的根 `node_modules` 并随发布包上传；否则必须安排维护窗口，先停 PM2 并确认有回滚点后再处理依赖安装。

Windows PowerShell 向远程 `bash -s` 传递多行部署脚本时，不要直接使用字符串管道；管道可能把末行转换为 CRLF，使 `trap` 等 Bash 命令在已切换成功后仍报错并触发回滚。应先把只含 LF 的 UTF-8 脚本编码为 Base64，再在服务器执行 `base64 -d | bash`，或上传经过行尾校验的 `.sh` 文件。

涉及考试会话或鉴权迁移时，切换前还要只读检查生产库中的 `in_progress` 考试。必须结合考试开始时间、时长和当前时间判断是否仍在有效考试窗口；只要存在仍有效记录就延期发布，不在部署过程中强制交卷。已经超过截止时间的陈旧记录可以记录在发布日志中，交由应用的超时结算或学生下次登录流程处理。

确认无误后再切换目录。因为生产 `.env` 使用绝对路径 `DATABASE_URL=file:/www/oj/prisma/prod.db`，不要在切换前的 `/www/oj-new` 执行 `npm run db:deploy`，否则会迁移旧目录数据库。正确顺序是停服务、备份并复制最新数据库、切换目录后在新的 `/www/oj` 执行迁移：

```bash
mkdir -p /www/backups
stamp=$(date +%Y%m%d-%H%M%S)
pm2 stop oj
cp /www/oj/prisma/prod.db /www/backups/prod-${stamp}.db
test -s /www/backups/prod-${stamp}.db
cp /www/oj/prisma/prod.db /www/oj-new/prisma/prod.db

test -d /www/oj-new/.next
test -d /www/oj-new/.next/standalone/.next/static
test -d /www/oj-new/.next/standalone/public
test -f /www/oj-new/.env
test -d /www/oj-new/node_modules
test -f /www/oj-new/prisma/prod.db

mv /www/oj /www/oj-old-${stamp}
mv /www/oj-new /www/oj
cd /www/oj
npm run check:env
npm run db:deploy
pm2 restart oj --update-env
curl http://127.0.0.1:3000/api/health
```

`npm run start` 会通过 `scripts/load-env.mjs` 预加载 `.env` 后启动 `.next/standalone/server.js`。不要绕过 `npm run start` 直接裸跑 standalone server，否则生产环境变量可能不会加载。

默认情况下，`scripts/load-env.mjs` 还会把 standalone 服务绑定到 `127.0.0.1`。外部流量只能经 Nginx 的 80/443 端口进入；发布后应确认 `ss -ltnp | grep 3000` 显示为 `127.0.0.1:3000`，并在云安全组中移除公网 `3000` 端口。

切换后除了 `/api/health`，还要抽查登录页的 `_next/static` 资源：

```bash
curl -I http://127.0.0.1:3000/_next/static/某个实际 chunk.css
```

如果健康检查失败，立即把最新 `/www/oj-old-*` 恢复为 `/www/oj`。健康检查应保留至少 60 秒的重试窗口，避免服务尚未完全启动时误判失败。

### 方案 B：同步到 Gitee

如果服务器访问 GitHub 不稳定，可以后续把 GitHub 仓库同步到 Gitee。这个方案仍会在服务器构建，只作为无法上传本地 Linux standalone 产物时的备用流程。服务器从 Gitee 拉取：

```bash
cd /www
git clone https://gitee.com/你的账号/OJ.git oj
cd /www/oj
```

后续更新：

```bash
cd /www/oj
git pull
npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
npm run check:env
npm run db:deploy
docker build -t oj-cpp-judge ./docker/judge-cpp
pm2 stop oj
NEXT_TELEMETRY_DISABLED=1 NEXT_PRIVATE_BUILD_WORKER_COUNT=1 NODE_OPTIONS='--max-old-space-size=768' npm run build
pm2 restart oj --update-env
```

无论使用哪种方案，都不要把 `.env`、`prod.db`、备份文件、真实密码提交到远程仓库。


## 12. 当前服务器容量建议

当前线上规格为 2 核 CPU、2GB 内存、4GB swap、3M 带宽，且 `JUDGE_CONCURRENCY=1` 表示同一时间只运行一个评测任务。建议：

```text
固定小班、每次 1-3 个并发评测：适合长期运行
短时间 4-5 个并发评测：可以使用，但会进入队列
持续 8-10 个并发评测：等待会明显变长
长期高并发：建议升级服务器并拆分数据库和 Judge
```

页面浏览不是主要瓶颈，真正瓶颈是 Docker Judge 的编译运行。扩大人数时优先考虑 4 核 8GB、PostgreSQL、Redis 队列和独立 Judge Worker。

如果 40GB 根分区空间不足，优先清理已确认不再需要的 `/www/oj-old-*` 和 OJ 发布压缩包。Docker build cache 虽然可能占用较大，但属于全局缓存，同机还有股票系统 Docker 容器，不能在未确认的情况下执行全局 prune。
