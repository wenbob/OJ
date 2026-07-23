# 2026-06-13 编辑器字号与 AC 弹窗上线记录

## 本次变更

- 全站共用 Monaco 编辑器增加代码字号调节。
- 字号控制支持 `A-`、`默认`、`A+`，并保存到浏览器 `localStorage`。
- 提交结果为 `Accepted` 时，页面中央显示通过提示图片。
- 通过提示图使用真实 alpha 透明 PNG，背景能透出当前题目页面。
- 通过提示图带弹入、停留和淡出动效，约 1 秒后自动消失。
- 弹窗不显示关闭按钮，仍支持点击遮罩提前关闭。

## 影响范围

编辑器字号调节集中在：

```text
src/components/CodeEditor.tsx
```

因此以下页面都会使用同一套字号控制：

```text
/student/problems/[id]
/student/exams/[id]/take
/admin/practice/problems/[id]
/admin/exams/[id]/practice
```

AC 弹窗集中在：

```text
src/components/ProblemSubmitForm.tsx
src/app/globals.css
public/ac-success.png
```

本次未修改 Judge、提交接口、数据库结构、考试流程或权限逻辑。

## 本地验证

上线前本地检查结果：

```text
npm run test        通过，31 个测试
npx tsc --noEmit    通过
npm run build       通过
```

## 线上发布

发布前已备份生产 SQLite 数据库：

```text
/www/backups/prod-20260613-160000.db
```

本次只同步相关文件到服务器：

```text
src/app/globals.css
src/components/CodeEditor.tsx
src/components/ProblemSubmitForm.tsx
public/ac-success.png
```

服务器仍按低内存流程构建：

```bash
cd /www/oj
pm2 stop oj
NEXT_TELEMETRY_DISABLED=1 NEXT_PRIVATE_BUILD_WORKER_COUNT=1 NODE_OPTIONS='--max-old-space-size=768' npm run build
pm2 restart oj --update-env
curl http://127.0.0.1:3000/api/health
```

构建日志确认使用单 worker：

```text
Collecting page data using 1 worker
Generating static pages using 1 worker
```

上线后本机和公网健康检查均返回：

```json
{"ok":true,"database":"ok","judgeMode":"docker"}
```

## GitHub 同步

功能提交：

```text
bf2d00b add accepted popup feedback and editor font controls
```

两个远程仓库的 `main` 分支均已同步：

```text
origin   https://github.com/wenbob/OJ.git
oj2026   https://github.com/wenbob/2026-OJC.git
```

## 维护注意

- `public/ac-success.png` 必须保持真实透明通道；不要替换为带棋盘格像素的伪透明图片。
- AC 弹窗的自动消失由 `ProblemSubmitForm.tsx` 控制，动效在 `globals.css` 中。
- AC 遮罩必须通过 portal 挂到 `document.body`，不要放回带 `transform` 的 `.app-stage` 内容树。
- 字号控制属于全站编辑器能力，不要在各页面重复写一套字号状态。
- 线上服务器内存较小，即使只改前端文件，也继续使用停 PM2 后单 worker 构建流程。

## 2026-07-23 补充：提交后视口居中修复

正式提交会自动滚动到结果区。原 AC 遮罩虽然使用 `position: fixed`，但它位于带入场动画 `transform` 的 `.app-stage` 内容树内，固定定位的参照因此变成该祖先；页面滚动后，提示图仍停留在旧内容位置。现已用 React portal 将同一遮罩渲染到 `document.body`，保留原动效、点击关闭和无障碍语义，并始终相对当前视口居中。

本次继续使用本地 Linux/Docker 构建 standalone，服务器未执行 `npm ci` 或 Next.js 构建。发布包审计未发现 `.env`、数据库、根 `node_modules`、`.next/cache` 或嵌套压缩包，并包含 OpenSSL 3 Prisma 引擎、静态资源和 `public/ac-success.png`。

生产回滚点：

```text
数据库备份：/www/backups/prod-20260723-121452-before-ac-popup.db
旧版本目录：/www/oj-old-20260723-121452
```

上线后确认 PM2 `oj` 在线、SQLite `quick_check` 为 `ok`、服务只监听 `127.0.0.1:3000`，内外网健康检查、登录页实际 CSS/JS 资源和 AC 图片均返回 200。部署前已完成 63 个测试文件、296 项测试，以及 TypeScript、Lint 和 Linux standalone 构建检查。
