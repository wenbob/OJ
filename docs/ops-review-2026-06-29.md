# 2026-06-29 OJ 旧版本目录磁盘清理记录

## 背景

服务器根分区是 40GB。检查时 `/` 已用 32GB，可用 6.1GB，使用率 84%。这次只处理 OJ 相关残留，不清理其它网站，也不清理股票系统。

运行内存不是主要问题：服务器 RAM 约 1.6GiB，OJ 的 PM2 进程只占约 24MB。用户看到的“40 多 G 只剩 6G”对应的是磁盘空间。

## 只读排查

执行范围限制在 OJ 明确路径：

```bash
df -h /
free -h
du -sh /www/oj /www/oj-old-* /www/oj-new /www/oj-release.tgz /www/oj.zip 2>/dev/null
ls -lh /www/backups/prod-*.db 2>/dev/null
docker system df
pm2 list
```

当时看到：

- 当前 `/www/oj` 约 1020MB。
- 4 个 `/www/oj-old-*` 旧版本目录合计约 4GB。
- 历史 `/www/oj.zip` 约 264KB。
- `/www/backups/prod-*.db` 总计约 16MB，体积很小，保留。
- Docker build cache 约 13GB 可回收，但 Docker 上正在运行 `stock-fund-advisor` v2/v3 容器，属于股票系统范围，本次不动。

## 实际清理

删除的 OJ 旧版本目录：

```text
/www/oj-old-20260506-175702
/www/oj-old-20260506-184103
/www/oj-old-20260628-171252
/www/oj-old-20260628-223719
```

删除的 OJ 历史压缩包：

```text
/www/oj.zip
```

未删除：

- `/www/oj`
- `/www/backups/prod-*.db`
- Docker 容器、镜像和 build cache
- 股票系统相关任何目录或 Docker 资源

清理后 `/` 变为已用 28GB，可用 11GB，使用率 74%。

## 验证

清理后确认：

```bash
curl http://127.0.0.1:3000/api/health
curl http://39.105.91.81/api/health
pm2 list
```

结果：

- `/api/health` 返回 `ok: true`、`database: ok`、`judgeMode: docker`。
- PM2 进程 `oj` 状态为 `online`。
- 当前线上目录 `/www/oj` 仍存在，大小约 1020MB。

## 维护结论

- OJ 常规磁盘清理优先删除已不需要回滚的 `/www/oj-old-*` 目录和 OJ 发布压缩包。
- SQLite 备份当前体积很小，不是磁盘压力来源，默认保留。
- Docker build cache 确实占用大，但它是全局缓存；服务器还运行股票系统 Docker 容器。除非用户明确确认，否则不要执行 `docker system prune` 或 `docker builder prune`。
- 每次清理都要先限定路径，再执行删除，最后做本机和公网 `/api/health` 验证。
