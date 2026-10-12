# 后台题库筛选发布记录

2026-10-12（北京时间）已部署到 `https://botcode.work`。应用源码为 `bc254afa47a56c0361ebdf9960c1a3f410df62ec`，补齐老师题目练习、管理员题目练习与题目管理的题名/题号搜索、难度及当前账号通过状态筛选。行为与入口见 [后台题库说明](staff-library-2026-10-11.md)。发布标识沿用源码完成日的 `staff-library-20261011`。

## 构建与数据保护

- Schema 和依赖不变，仍为 24 项迁移。本地 Docker 使用 Node 22 / Debian Bookworm 与 OpenSSL 3 生成 Linux standalone，生产服务器不承担安装或构建。
- 发布包 `/www/oj-staff-library-20261011-linux.tgz`，64,893,207 字节，SHA-256 为 `fe442220b27b51f6794c5816022fcd1de781c54bc9fe39a4dc14d86c1e05b2d9`。
- 审计 6,988 个条目、681 个源码文件；13 项 public 素材在根目录和 standalone 中逐项核对一致，静态资源完整。Prisma 引擎仅为 `libquery_engine-debian-openssl-3.0.x.so.node`。环境文件、数据库、备份、缓存及嵌套发布包均未进入包。
- 发布前与切换时使用 SQLite backup API 保留最新库，保留 `/www/backups/prod-20261011-staff-library-preflight.db`、`prod-20261011-staff-library-cutover.db`、`prod-20261011-staff-library-rollback-latest.db` 及最终的 `prod-20261011-staff-library-cutover-retry.db`；各为 9,601,024 字节，0600，完整性检查通过。
- 停机前没有进行中考试或运行中的 OJ 评测容器。依赖复用时将 Prisma client 单独替换，避免写入旧版本共享文件。
- 最终切换后，对最新备份与生产库的 28 张业务表逐表检查行数，并双向比较全部字段；数据一致。保留 2,403 条提交、5,933 条测试结果、2,029 道题、53 个账号、3 场考试、4 条考试记录及其他业务行，完整性和外键检查通过。
- 回滚版本为 `/www/oj-old-20261011-staff-library`。应用根 0755、`.env` 0600，PM2 单 fork 通过 `npm run start` 启动，监听 `127.0.0.1:3000`。

## 验收与一次回滚

133 个单元测试文件、735 项测试通过；TypeScript、lint 与 Linux 正式构建通过。4 项后台专用浏览器场景验证账号隔离、历史 Accepted、未作答、题号及标题组合查询、分页返回、题型切换、编辑内容保持与保存、排序保护和网络失败重试。另有学生组合筛选及三端原生链接、响应式布局 3 项回归通过。

第一次生产验收把“共 921 道题”当作原始 HTML 字符串匹配，React 插入的 `<!-- -->` 注释造成误判。发布脚本自动保留最新数据库并恢复旧应用；只读核对证明实际计数与数据库一致。验收脚本移除 HTML 注释后重新匹配，应用源码和发布包未改变；重新备份最新库并发布成功。

最终公网连续 3 次健康检查、登录页面、6 个真实 CSS/JS 与 AC 图片均通过；静态资源保留 immutable 和 nosniff。20 组筛选检查直接与生产 Prisma 查询总数比较，覆盖三种角色、两种题型、三种通过状态及管理员题名/题号与难度、分类组合；老师访问管理员列表接口返回 403，未登录返回 401。Docker 合成 C++ 得到 Accepted / 2，公开样例不匹配得到 mismatched，验收未创建学习提交。

正式站点 Chrome 验证学生题库、老师练习、管理员练习和管理页的搜索、难度、通过状态，后台返回条件及排序保护、清空筛选。四个入口各检查 320 / 1280px，没有页面横向溢出，页面脚本错误为 0。验收仅允许真实 GET/HEAD，阻断写请求；临时会话只在进程内存中，公告弹窗使用受控空响应。编辑保存和失败重试在隔离测试数据库验证。本地 `127.0.0.1:3000` 持续可用，健康检查通过。

## Git 与收尾

应用源码、测试及说明已同步并核对公开 [wenbob/OJ](https://github.com/wenbob/OJ/commit/bc254afa47a56c0361ebdf9960c1a3f410df62ec) 和私有 [wenbob/2026-OJC](https://github.com/wenbob/2026-OJC/commit/bc254afa47a56c0361ebdf9960c1a3f410df62ec) 的 `main`。发布记录及导航补充另作提交；`release.json.gitCommit` 保持实际构建的应用提交，文档提交单独记录。

发布包、备份和回滚版本保留；本次服务器临时部署、诊断和会话验收脚本在最终检查后清理。环境文件、数据库、备份、密钥、临时会话和发布包均不提交 Git。
