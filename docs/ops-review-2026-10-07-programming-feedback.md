# 2026-10-07 编程反馈发布记录

## 发布范围

- 公开样例不匹配时，标准输出保持原样，只标红程序输出错误位置；复制保留原始文本。
- 三端编程提交结果使用紧凑卡片，显示“通过了 / 未通过”和简短原因，完整信息仍由原提交详情与服务端权限控制。
- 应用源码：`79ba0214a58acfca55c0c1a7b248354b0f887e80`，基于 `7c23de5`。选择判断题、考试保护、奖励、积分、任务进度和鉴权保持原行为；无依赖或数据库结构变更。
- 正式入口：`https://botcode.work`。2026-10-07 20:57（北京时间）完成目录切换与应用启动，随后完成验收。

## 构建与包审计

- 本机 Docker `node:22-bookworm-slim` 安装 OpenSSL 3，执行 `npm ci --include=dev`、Prisma 生成与两 worker 生产构建。服务器没有安装依赖或构建。
- 发布包：`/www/oj-feedback-20261007-linux.tgz`，64,689,262 字节。
- SHA-256：`658ed8384771d4d1146b109cb08380d3964012f1c0902b3fe802aaa00764ce5b`。
- 源码归档 SHA-256：`f99ea54dd78f1cbbb901c7add74928ae7b46af187de5c39efcbecc4199e8647d`。
- 逐条审计 6,905 个归档条目，657 个源码文件与 Git 快照一致；`next-env.d.ts` 为 Next 生产构建生成文件。13 个 public 资源在根目录与 standalone 中分别核对一致。
- 无任何层级的环境文件、数据库、备份、根 node_modules、构建缓存或嵌套压缩包；归档路径与内部链接安全，根权限 0755。
- 包含 static、public 与 `libquery_engine-debian-openssl-3.0.x.so.node`，sharp 转码正常。依赖和 schema 与生产版本一致；复用根依赖时先移动新目录的旧 `.prisma`，再复制本次 client，没有覆盖旧版本共享硬链接。

## 备份与切换

- 发布前、切换前、停止 PM2 后均确认没有有效进行中考试或运行中的 OJ Judge 容器。
- 初始备份：`/www/backups/prod-20261007-feedback-preflight.db`。
- 停服后的最终备份：`/www/backups/prod-20261007-feedback-cutover.db`。
- 两份备份各 9,572,352 字节，SQLite 备份 API 生成，完整性检查通过，权限 0600。
- 回滚目录：`/www/oj-old-20261007-feedback`。备份与旧版本保留；失败保护先保存最新数据库，再恢复旧代码，避免覆盖切换后产生的学习记录。
- 新 `/www/oj` 执行 `db:deploy` 与 `db:status`：23 个迁移已应用，没有待执行迁移。未执行 seed 或 db:init。
- 启动前逐行核对 27 张业务表与停服快照，所有内容一致；设置明确查询 `key, value`，SQLite integrity_check 和外键检查通过。
- 应用根 0755、`.env` 0600，通过 `npm run start` 与 `pm2 restart oj --update-env` 启动；仅监听 `127.0.0.1:3000`。没有修改 Nginx、证书或其他站点。

## 验收

- 129 个单元测试文件、719 项测试全部通过；28 项端到端测试、TypeScript、lint、Windows 与 Linux 构建通过。
- 服务器直连与公网健康检查通过。登录页、六个实际 CSS/JS 和 AC 图片均返回 200，静态资源保留 immutable 缓存与 nosniff；三端题面正常加载新版对比与结果卡片代码。
- 未登录访问管理员积分设置与反馈返回 401；学生、老师访问管理员积分设置返回 403，管理员正常读取；题目接口只返回公开样例测试。
- 生产 Docker Judge 使用独立合成代码得到 Accepted / 2，试运行准确识别 mismatched；未创建正式提交。
- 正式站点 Chrome 分别检查学生、老师与管理员，标准输出原样、程序错误标红、通过与未通过卡片均正常；320、768、1280、1440px 共 12 次布局检查无主体横向溢出，卡片高度低于 150px，无页面脚本错误，键盘试运行正常。
- 浏览器使用临时签名会话与浏览器内受控试运行/提交响应，其他写请求全部阻断；不改变 sessionVersion，没有创建真实提交、确认公告或改变学习记录。真实编译评测由上一项 Docker 冒烟独立验证，不将模拟响应当作正式提交通过的证据。
- 验收后 User 52、Problem 2,029、Submission 2,385、ExamRecord 4、PointReward 15、StudentPointAdjustment 5，设置与业务计数保持一致。

## Git 保存与说明同步

本次保存范围为应用源码、测试、受控截图及项目说明，同步目标为两个现有仓库的 `main`：

- 公开 `origin`：[wenbob/OJ 应用提交](https://github.com/wenbob/OJ/commit/79ba0214a58acfca55c0c1a7b248354b0f887e80)。
- 私有 `oj2026`：[wenbob/2026-OJC 应用提交](https://github.com/wenbob/2026-OJC/commit/79ba0214a58acfca55c0c1a7b248354b0f887e80)。

应用提交与发布后文档提交分别保留。README、文档导航、界面说明和预览索引更新为已发布状态；历史发布事实保持原样。验收结束后删除临时签名会话与远程部署脚本，保留发布包、备份和回滚版本。环境文件、数据库、备份、密钥、临时会话与发布包不入 Git。

界面约定和隔离测试截图见 [编程反馈说明](programming-feedback-2026-10-07.md)，后续更新按 [部署手册](deploy.md) 执行。以上路径是本次发布证据，恢复前仍须重新确认文件存在与数据库完整性。
