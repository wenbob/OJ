# 2026-08-01 批量作业发布、学情通讯录与低内存上线记录

## 发布内容

- 管理员和老师新增独立“作业发布”，支持搜索并选择 1–100 名学生、统一公共题和发布前个性化增删。
- 批量发布在单个事务内完成全量校验，任一学生冲突时整批零写入。
- 学情列表增加用户名搜索、中文拼音固定排序和 `A–Z #` 通讯录索引。
- 个性化编辑默认折叠；点击学生行按钮后自动定位。桌面端学生筛选面板随视口跟随，移动端保持自然布局。
- 新增 `pinyin-pro 3.28.2`，并将 Next.js 更新至 16.2.12；PostCSS、DOMPurify 与 Sharp 使用已修复版本，生产依赖审计为 0。

## 本地验证

- 提交：`e1d46bd feat: add batch homework publishing`
- `npx prisma validate`：通过。
- 完整迁移：13 条迁移在临时 SQLite 数据库全部执行成功。
- `npm run test`：84 个测试文件、447 项测试全部通过。
- `npx tsc --noEmit`、`npm run lint`、受限内存 `npm run build`：全部通过。
- Linux 构建：Ubuntu 24.04、Node.js 20.20.2、OpenSSL 3.0.13、单 worker、Node 堆上限 1024MB。
- 归档：282,464,260 字节；SHA-256 `733a5fa9df6148935f108ad2e3a44d495aec447e70d6f55803ac418f974281ef`。
- 归档检查：无 `.env*`、数据库、SQLite 派生文件、`.next/cache` 或嵌套压缩包；包含静态资源、Linux 根依赖和 `libquery_engine-debian-openssl-3.0.x.so.node`。
- 独立启动检查：`/api/health`、登录页 CSS 和 `pinyin-pro` 加载均通过。

## 生产发布

- 生产目录：`/www/oj`；PM2 进程：`oj`。
- 切换前确认无进行中的考试。
- 数据库备份：`/www/backups/prod-before-20260801-160251-batch-assignments.db`，`PRAGMA quick_check` 为 `ok`。
- 回滚目录：`/www/oj-old-20260801-160251-batch-assignments`。
- 生产迁移：13 条迁移均已应用，无待执行项。
- 数据核对前后相同：27 个用户、1350 道题、1478 条提交、0 场考试、0 份专项练习。
- 新版 Next.js 16.2.12、静态资源、鉴权路由、端口绑定、Judge 编译运行和公网健康检查均通过。

## 异常与修正

首次切换完成并健康后，PowerShell 多行字符串管道附带的 CRLF 使最后一条 Bash `trap` 清理命令报错，自动回滚机制立即恢复旧版本，数据库无损。随后改用 LF UTF-8 脚本的 Base64 传输，第二次切换成功。该约束已写入 `docs/deploy.md`。

## 清理结果

- 删除 18 个更早的 `/www/oj-old-*` 回滚目录和本次上传压缩包，共释放约 3.8GB 历史目录空间。
- 保留本次最新回滚目录和全部数据库备份。
- 清理后磁盘占用 43%，可用约 22GB；`/api/health` 仍正常。
