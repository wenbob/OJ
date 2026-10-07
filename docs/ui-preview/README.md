# 竞技学院首页美化预览

本目录保留 UI 优化计划阶段 A 的可交互设计稿，采用演示数据，不连接账号、数据库、考试、评测或奖励接口。正式页面的接入说明见 [UI 实施记录](../ui-implementation.md)。

## 查看

直接用浏览器打开 `index.html`，或在项目根目录运行以下命令后访问 `http://127.0.0.1:4317`。无需安装依赖、登录或启动 Next.js。

```powershell
node docs/ui-preview/serve.mjs
```

预览服务器仅监听本机。结束预览时在运行它的终端按 Ctrl+C。

- **桌面 / 手机**：查看同一首页在不同宽度下的布局；窄屏实际浏览器也会自动适配。
- **样式板**：查看候选配色、图标、按钮、表单、状态和第一张生成插画。
- **减少动效**：关闭过渡与入场效果；浏览器系统设置同样生效。
- **继续专项练习**：勾选演示任务，关闭后查看首页进度；可重置。
- **日常刷题**：体验分类筛选与通过标签。
- **我的奖励**：体验一次演示抽奖，重复打开保留本次页面会话的结果。刷新会重置所有演示状态。

## 本轮设计

保留现有米色纸张、深墨、钢蓝和黏土橙，减轻边框与文字厚重感。导航采用图标加文字；任务和段位进入首页主要区域，四个功能入口统一构图。辅助信息采用更轻的字重与对比。

导航顺序沿用现有学生端，奖励位于天梯右侧。预览不改变正式考试布局、Monaco、AI 权限、计分、奖励期限或服务端脱敏。

候选值：卡片圆角 12px、按钮 7px、导航图标 16px、常规卡片悬停 2–3px、普通页面入场 180ms / 4px。接入现有页面前仍需依据真实内容做视觉回归。

## 生成素材

使用内置 `image_gen` 工具生成，保留原稿，页面采用等比例缩小和压缩后的 WebP。没有替换既有素材。

- `assets/code-scroll-source.png`：1254 × 1254，透明 PNG 原稿。
- `assets/code-scroll.webp`：384 × 384，透明 WebP，15,678 字节，首页展示约 80–102px。
- 其余三个入口在本轮使用线条概念图标，后续再制作同系列图片。

生成提示词：

> Use case: stylized-concept. Create one refined small web UI illustration for a Chinese C++ teaching website with an existing 'competitive academy' aesthetic. Subject: a single cream-colored paper scroll or folded coding practice booklet, partially open, with only a simple dark ink </> code symbol on its front, and a small clay-orange ribbon. Style: tasteful handmade layered paper cut craft, soft bevels, fine subtle paper texture, compact silhouette, crisp edges, understated 3/4 view, not photorealistic and not glossy plastic. Palette strictly warm ivory #fffdf7, dark ink #161713, muted steel blue #4f6f88, clay orange #b66b41; small warm gold accent allowed. Consistent gentle upper-left light, very subtle contained shadow. Isolated centered subject with roughly 15% empty margin on all sides. Transparent alpha background, no backdrop, no ground plane, no border or card, no cast shadow outside the object footprint. It must remain recognizable at 80px wide, so use bold simple forms and restrained detail. Square composition. No text, letters, numbers, brand logo, watermark, or extra objects. This will be the reference illustration for a family of daily practice, exam, assignments, and rewards icons.

## 验证

2026-10-01 使用本机 Google Chrome、Playwright CLI 和仅监听 `127.0.0.1` 的静态预览服务器验证：

| 检查 | 结果 |
| --- | --- |
| 首页 360、390、768、1024、1280、1440px | 页面宽度与视口一致，主体无溢出；导航按设计内部横向滚动 |
| 样式板 360、390、768、1440px | 无页面横向溢出 |
| 桌面、手机、样式板切换 | 正常；手机模式点击首页保持手机宽度 |
| 任务勾选与进度 | 3/5 更新到 5/5，完成标记及待完成数量同步 |
| 分类筛选 | 选择基础语法后仅展示 A+B 演示题 |
| 弹窗与键盘 | Escape 关闭后恢复入口焦点；列表详情切换后仍恢复原入口 |
| 演示奖励 | 展示 +6 分，重复打开保留结果并禁用重复领取 |
| 系统减少动效与预览开关 | 入场动画为 none、卡片过渡为 0s |
| 图片 | WebP 正常解码，原图与压缩版均保留 alpha 通道 |
| 控制台 | 0 条错误、0 条警告 |
| 页面请求 | 仅本地 HTML 与 WebP，无业务接口或外部资源请求 |

当前浏览器自动化工具禁止访问 `file:` 协议，因此双击离线打开未做浏览器验收；本轮已验证本地静态服务器访问。预览采用内嵌 CSS/JS 与相对图片路径，没有 CDN 依赖。

阶段 A 没有修改应用源码，以上是设计稿自身的验收记录。正式接入后的检查单独记录在 UI 实施记录中。

截图代表候选设计，不代表正式站点已经发布：

- [桌面首页](screenshots/home-desktop.png)
- [手机首页](screenshots/home-mobile.png)
- [统一样式板](screenshots/style-board.png)

## 后续实际页面截图

2026-10-07 的编程反馈截图来自隔离的 Next.js 浏览器测试，使用受控样例及提交响应，与上方阶段 A 设计稿分开记录。实现、验证范围和本地发布状态见 [编程反馈说明](../programming-feedback-2026-10-07.md)。

- [公开样例输出差异](screenshots/programming-output-diff.png)
- [编程提交通过](screenshots/programming-submit-success.png)
- [编程提交未通过](screenshots/programming-submit-failure.png)
