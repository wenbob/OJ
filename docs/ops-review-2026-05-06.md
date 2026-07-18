# 2026-05-06 线上更新复盘与运维经验

本文记录 2026-05-06 对 OJ 平台线上站点进行更新、排障和稳定性处理时总结出的经验。文档不记录任何真实管理员密码、服务器密码、Token 或 `.env` 内容。

## 1. 当天完成的更新

本次线上维护主要完成了以下内容：

- 隐藏登录页上的默认账号提示，避免把测试账号展示给学生。
- 隐藏登录页左侧的角色说明和技术栈说明，让登录页更干净。
- 将 Docker Judge 镜像从 `gcc:13` 改为 `ubuntu:22.04 + g++ + 阿里云 Ubuntu 源`，避免服务器拉取 Docker Hub 镜像超时。
- 新增 `JUDGE_COMPILE_TIMEOUT_MS`，把 Docker 编译阶段超时时间从原先硬编码的约 10 秒改为可配置。
- 线上 `.env` 设置 `JUDGE_COMPILE_TIMEOUT_MS=45000`。
- 针对 Docker 编译超时问题，将默认评测内存从 128MB 提高到 512MB。
- 补充部署文档和线上维护说明。

## 2. 遇到的问题

### 2.1 服务器目录不是 Git 仓库

线上 `/www/oj` 是通过压缩包上传部署的，不是通过 `git clone` 得到的目录，因此执行：

```bash
git pull
```

会报：

```text
fatal: not a git repository
```

经验：

- 压缩包部署时不能使用 `git pull` 更新。
- 后续如果希望服务器直接拉代码，应重新用 GitHub 或 Gitee 克隆部署。
- 在当前模式下，继续使用 `git archive` 打包上传更稳。

### 2.2 小服务器执行 npm install 容易卡满资源

2 核 2G 服务器执行 `npm install` 时 CPU 和内存容易接近满载，看起来像卡死。

当天处理方式：

```bash
npm config set registry https://registry.npmmirror.com
```

并启用 4G swap：

```bash
swapoff /swapfile
rm -f /swapfile
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
free -h
```

经验：

- 部署时优先使用 `npm ci`，不要用 `npm install`。
- 使用国内 npm 镜像源可以明显减少等待时间。
- 2G 内存机器建议保留 4G swap。
- 如果 `npm ci` 正在运行且仍有 CPU 活动，不要频繁 `Ctrl+C`。

### 2.3 `npm ci --omit=dev` 不适合构建阶段

当天曾尝试：

```bash
npm ci --omit=dev
```

这个命令只安装生产依赖，不适合需要执行 `npm run build` 的阶段，因为构建还需要 TypeScript、Prisma CLI、tsx 等开发依赖。

经验：

- 构建前使用：

```bash
npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
```

- 构建完成后如要极限节省空间，再单独考虑生产依赖裁剪。

### 2.4 切换目录时 `/www/oj-new` 不存在导致服务目录消失

当天执行切换时出现：

```bash
mv /www/oj /www/oj-old-...
mv /www/oj-new /www/oj
```

第二步失败，导致 `/www/oj` 暂时不存在，PM2 无法从正确目录启动。

恢复方式：

```bash
cd /www
latest_old=$(ls -dt /www/oj-old-* 2>/dev/null | head -n 1)
mv "$latest_old" /www/oj
cd /www/oj
pm2 restart oj --update-env
curl http://127.0.0.1:3000/api/health
```

经验：

- 切换目录前一定先确认 `/www/oj-new` 存在且构建成功。
- 切换前先备份数据库。
- 出错时优先恢复 `/www/oj` 目录，再排查其他问题。

### 2.5 PM2 不一定读取新增环境变量

`.env` 中已经写入：

```env
JUDGE_COMPILE_TIMEOUT_MS=45000
```

但通过：

```bash
pm2 env 0 | grep JUDGE_COMPILE_TIMEOUT_MS
```

一开始看不到该变量。

经验：

- 修改 `.env` 后需要：

```bash
pm2 restart oj --update-env
```

- 如果仍然读取不到，可以临时导出后重启：

```bash
export JUDGE_COMPILE_TIMEOUT_MS=45000
pm2 restart oj --update-env
```

### 2.6 Docker 编译超时不是学生代码错误

页面显示：

```text
Compile Error
Docker 编译超时
```

并且耗时约 `45500 ms`，说明服务已经读取到 45 秒超时配置，但 Docker 容器内 g++ 编译仍然没有完成。

根因判断：

- 2 核 2G 服务器资源有限。
- Docker 每次提交都要启动容器。
- `g++` 编译包含 `#include <bits/stdc++.h>` 的代码比较吃内存。
- 原先默认内存 128MB 对编译阶段太小。

当天处理方式：

- 保留运行超时配置。
- 将默认评测内存从 128MB 调整到 512MB。

经验：

- 编译阶段和运行阶段最好分开配置资源。
- 当前 Demo 阶段可以先把默认内存调高到 512MB。
- 后续更合理的做法是增加 `JUDGE_COMPILE_MEMORY_LIMIT_MB`，编译给 512MB 或 1024MB，运行仍按题目限制执行。

## 3. 推荐的压缩包更新流程

本地打包：

```powershell
cd D:\CODEX_sum\c++在线平台系统
git archive -o oj.zip HEAD
```

上传到服务器：

```text
/www/oj.zip
```

服务器执行：

```bash
cd /www

mkdir -p /www/backups
cp /www/oj/prisma/prod.db /www/backups/prod-$(date +%Y%m%d-%H%M%S).db

rm -rf /www/oj-new
mkdir -p /www/oj-new
unzip -o /www/oj.zip -d /www/oj-new

cp /www/oj/.env /www/oj-new/.env
cp /www/oj/prisma/prod.db /www/oj-new/prisma/prod.db

cd /www/oj-new
npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
npm run build
```

确认构建成功后再切换：

```bash
cd /www

test -d /www/oj-new
test -d /www/oj-new/.next
test -f /www/oj-new/.env
test -f /www/oj-new/prisma/prod.db

mv /www/oj /www/oj-old-$(date +%Y%m%d-%H%M%S)
mv /www/oj-new /www/oj

cd /www/oj
pm2 restart oj --update-env
curl http://127.0.0.1:3000/api/health
```

如果健康检查失败，立即恢复切换前保留的旧版本：

```bash
cd /www
mv /www/oj /www/oj-broken-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true
latest_old=$(ls -dt /www/oj-old-* | head -n 1)
mv "$latest_old" /www/oj
cd /www/oj
pm2 restart oj --update-env
curl http://127.0.0.1:3000/api/health
```

## 4. 每次更新后的检查命令

```bash
cd /www/oj

curl http://127.0.0.1:3000/api/health
pm2 status
ss -lntp | grep ':3000'
pm2 logs oj --lines 30
```

期望：

- `/api/health` 返回 `ok: true`
- `database` 是 `ok`
- `judgeMode` 是 `docker`
- 只有一个进程监听 `3000`
- PM2 状态是 `online`

## 5. 判题异常排查顺序

如果学生提交异常，按这个顺序排查：

1. 健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

2. Docker 是否正常：

```bash
docker info
docker images oj-cpp-judge
```

3. PM2 日志：

```bash
pm2 logs oj --lines 80
```

4. 环境变量：

```bash
grep -n "JUDGE_" .env
pm2 env 0 | grep JUDGE
```

5. 端口监听：

```bash
ss -lntp | grep ':3000'
```

如果是 `Docker 编译超时`：

- 先确认 `JUDGE_COMPILE_TIMEOUT_MS` 是否存在。
- 再确认默认内存是否太小。
- 小服务器建议默认内存 512MB。

## 6. 安全注意事项

不要做：

- 不要把真实 SSH 密码发到聊天、文档或 Git。
- 不要把真实管理员密码写进 README。
- 不要提交 `.env`。
- 不要提交 `prod.db`。
- 不要提交 `node_modules`。
- 不要提交 `.next`。
- 不要重复执行 `npm run seed`。
- 不要在线上随便执行 `npm run db:init`。

应该做：

- 线上更新前先备份 SQLite 数据库。
- 默认管理员密码上线后立即修改。
- SSH 密码如果曾经暴露，应立即更换。
- 阿里云安全组建议关闭公网 `3000`，只通过 Nginx 暴露 `80` / `443`。
- 后续可以绑定域名并配置 HTTPS。

## 7. 后续建议

短期：

- 给线上部署写一键更新脚本，减少手动复制命令出错。
- PM2 启动方式已统一走 `npm run start`，由脚本先检查环境、预加载 `.env`，再启动 standalone；不要裸跑 `node .next/standalone/server.js`。
- 将编译内存和运行内存拆分配置。

中期：

- 同步 GitHub 到 Gitee，让服务器可以稳定 `git pull`。
- 增加自动 SQLite 每日备份。
- 增加 Docker Judge 的真实冒烟测试脚本。

长期：

- 如果学生数量增加，考虑 PostgreSQL。
- 如果提交量增加，考虑独立 Judge 服务、Redis 队列或专用沙箱。
