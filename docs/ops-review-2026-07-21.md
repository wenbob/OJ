# 2026-07-21 多文档导入与选择判断公式渲染上线记录

## 上线范围

- 管理员题目管理的题型切换改为只接受最后一次请求结果，分类列表由服务端按当前题型完整返回，避免快速切换或刷新后标签错乱。
- Markdown 导入支持一次选择最多 20 个文档；单文件不超过 1MB，源文档合计不超过 8MB，解析失败会标明文件名且整批不进入确认导入。
- 选择判断题题干和选项支持 `$...$`、`$$...$$` 数学公式，使用 KaTeX 渲染次方、下标、分数和根号；代码块、行内代码和受信任的洛谷 CDN 图片继续分别处理。
- 新增洛谷公开原文审计工具，可核对本地数据库或仓库外的一级至三级选择判断 Markdown。
- 本次只发布网站代码和导入能力，没有上传 `D:\GESP-md文档` 中的任何题目数据，题目仍由管理员手动导入。

## 请求限制与安全边界

- 应用层 Markdown 导入 JSON 上限为 24MB，Nginx `client_max_body_size` 为 25MB，给 8MB 源文档及解析预览 JSON 留出安全余量。
- 数学公式只通过 KaTeX 生成 HTML；远程图片只允许洛谷受信任 CDN，其他 Markdown 图片保持普通文本。
- 发布包审计未发现 `.env`、数据库、根 `node_modules`、`.next/cache` 或嵌套压缩包；仅包含 OpenSSL 3 的 Prisma 引擎。

## 本地验证与构建

- `npm run test`：54 个测试文件、259 个测试全部通过。
- `npx tsc --noEmit`、`npm run lint` 和 `npm run build` 全部通过。
- Linux standalone 包大小为 55,210,829 字节，SHA-256 为 `8c8f4e51146e1553f104cd4d873e9249d348e0d627e86621275d150cbac1fcdc`。
- 本地一级至三级选择判断共 41 套、1025 道题，82 份 Markdown 全量回读通过；写入后再次审计为 0 差异。

## 线上发布与回滚点

- 发布前生产库不存在 `in_progress` 考试记录。
- 数据库备份：`/www/backups/prod-20260721-120947-before-objective-import.db`。
- 旧版本目录：`/www/oj-old-20260721-120947`。
- Nginx 配置备份：`/etc/nginx/sites-available/oj.before-batch-import-20260721-120920`。
- 服务器没有执行 `npm ci` 或 Next.js 构建；新版本由本地 Docker Linux 构建后上传切换。
- Prisma 检查发现 9 个迁移均已应用，没有待执行迁移。

## 线上验收

- 切换前后数据计数一致：用户 27、题目 705、提交 1428、测试点 1343。
- SQLite `quick_check` 为 `ok`，外键检查无异常。
- PM2 进程在线，服务只监听 `127.0.0.1:3000`，内外网 `/api/health` 均正常。
- 登录页和实际 CSS 静态资源返回 200；standalone 包内存在 KaTeX 字体和批量导入页面代码。
- 约 4MB 的未登录导入请求到达应用并返回权限错误，而不是被 Nginx 以 413 拒绝。
- 服务器上传包 `/www/oj-release.tgz` 已在验收后删除。

## GitHub

- 首次功能提交：`64ab4fb Add batch problem import and objective math rendering`，已推送到 `origin/main` 和 `oj2026/main`。

## 同日增量：编程题富文本与解析卡死修复

- 新增共享 `ProblemRichText` 组件，把 KaTeX、代码块、行内代码、标题、列表、表格、链接、粗体和洛谷受信任 CDN 图片扩展到编程题题面、选择判断题以及两类导入预览。
- Markdown 解析器会移除文件开头的 UTF-8 BOM，避免首个一级标题无法识别。
- 解析后页面卡死的根因是递归处理粗体内容时复用了模块级 `/g` 正则，嵌套调用会改写同一个 `lastIndex`，外层循环可能反复匹配同一位置。修复后每次递归调用都会创建独立正则实例。
- 本次只调整网站解析与显示，没有导入或修改 `D:\GESP-md文档` 中的题目数据，也没有数据库结构变更。

增量本地验证：

- `npm run test`：55 个测试文件、264 个测试全部通过。
- `npx tsc --noEmit` 和 `npm run lint` 通过。
- 16 题来源文档解析未再卡死：5 道满足至少两组样例的题目可解析，其余 11 道只因样例不足被正常拒绝；预览共生成 129 个 KaTeX 节点。

增量发布：

- 功能提交：`55d390e fix: render imported problem markdown safely`。
- Linux standalone 包大小为 49,724,539 字节，SHA-256 为 `f40dd22f0479a3c141714e955b4c4153611be53d6bf9ada5b88f9ab031ac38e3`。
- 数据库备份：`/www/backups/prod-20260721-165242-before-problem-rich-text.db`；旧版本目录：`/www/oj-old-20260721-165242`。
- 服务器没有执行 `npm ci`、Next.js 构建、`seed` 或数据库初始化；9 个迁移均已应用，没有待执行迁移。
- 切换前后数据计数一致：用户 27、题目 760、提交 1428、测试点 1345、考试记录 2。SQLite `quick_check` 为 `ok`，外键检查无异常。
- PM2、内外网健康检查、登录页与实际静态资源、`127.0.0.1:3000` 监听均正常；真实 Docker Judge 运行 `19 + 23` 得到 `42`，状态为 Accepted，且提交总数未增加。
- 本次增量和洁癖收尾提交仅按要求推送到 `origin/main`；未更新 `oj2026` 远端。
