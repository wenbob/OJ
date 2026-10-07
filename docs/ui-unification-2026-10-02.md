# 三端 UI 统一与题目点击优化

本次以既有纸色、钢蓝和黏土橙风格统一界面。学生、老师和管理员共用展示组件，各自的权限、数据范围和管理功能继续由原页面处理。2026-10-02 已发布至正式站点，备份、回滚与线上验证见 [发布记录](ops-review-2026-10-02-ui-unification.md)。

2026-10-07 本地新增的样例差异标红与精简编程提交结果见 [编程反馈说明](programming-feedback-2026-10-07.md)。下方的发布状态和验收数量仍对应 2026-10-02。

## 已处理清单

| 项目 | 覆盖位置 | 实现 |
| --- | --- | --- |
| 日常题库 | 学生日常刷题、老师和管理员题目练习 | 共用 `ProblemListTable`，统一分类、表头、行间距、题型与通过标记 |
| 分类筛选 | 三端题库、错题本、作业选题、考试组卷、题目管理 | 共用 `FilterLink` / `FilterButton`，统一圆角、颜色、选中和键盘焦点 |
| 周期筛选 | 学情看板、学情详情、AI 使用看板 | 使用同一套筛选链接，保留原 URL 与周期范围 |
| 题目入口 | 三端日常题库、错题本、专项题单、后台考试练习题单 | 题目主体与空白区域可点击；原生链接支持键盘和新标签页 |
| 标题与图标 | 首页、题库、考试、提交、专项、天梯、学情、AI、账号、设置、公告与反馈 | 共用 `PageHeading` 与 `UiIcon`；普通标题 24px、主视觉 32px、区块 20px、题目段落 18px |
| 题目内容 | 日常题目详情、后台考试练习、学生正式考试内容 | 共用 `ProblemContentSection`；保留正式考试的 h3 层级与锁定布局 |
| 标签 | 题型、难度、分类、通过标记、提交与考试状态等 | 共用 `UiBadge`；圆角 6px，原状态文字与语义配色保留 |
| 空状态 | 题库、考试、提交、错题本、作业、学情、AI、公告、反馈等 | 共用 `AcademyEmptyState`；学生训练页面使用现有插画，后台使用紧凑图标 |
| 表单与提示 | 公告发布及共用输入、筛选、错误提示 | 使用既有 `field` / `btn` 与统一圆角；固定考试提示继续保留原位置 |
| 手机布局 | 三端顶部账号区、管理员设置、后台考试练习 | 退出按钮不被挤出屏幕；设置表格仅内部滚动，屏幕阅读器标签保持在对应控件内；后台考试内容在空间足够时再分两栏 |

题目行的未通过悬浮色为 `rgba(79,111,136,0.12)`，通过状态为淡绿色；触屏不依赖悬浮。取消了非题目普通表格行的通用位移动效，避免使不可点击条目看起来可以进入。

## 组件与维护入口

| 用途 | 源码入口 | 约定 |
| --- | --- | --- |
| 三端日常题库 | [ProblemListTable](../src/components/ProblemListTable.tsx) | 页面传入题目、统计、通过状态和角色路径；宽表格在容器内滚动 |
| 题目主体链接 | [ProblemEntryLink](../src/components/ProblemEntryLink.tsx)、[NavigationLink](../src/components/NavigationLink.tsx) | 有独立控件的行或卡片使用展开链接；只有单一入口的专项条目使用原生整块链接 |
| 分类与周期筛选 | [FilterChip](../src/components/FilterChip.tsx) | URL 跳转用 `FilterLink` / `aria-current`；页面内筛选用 `FilterButton` / `aria-pressed` |
| 标题和图标 | [PageHeading](../src/components/PageHeading.tsx)、[UiIcon](../src/components/UiIcon.tsx) | 普通标题 24px、主视觉 32px、区块 20px、题目段落 18px，字重 700；图标按语义选择 |
| 标签 | [UiBadge](../src/components/UiBadge.tsx) | 原文字与状态含义保留，按语义选颜色，圆角 6px |
| 题目段落和样例 | [ProblemContentSection](../src/components/ProblemContentSection.tsx)、[ProblemSamples](../src/components/ProblemSamples.tsx) | 复用题面渲染与样例复制，按页面标题层级传入 h2 或 h3 |
| 样例输出对比（2026-10-07 本地新增） | [OutputComparison](../src/components/OutputComparison.tsx)、[outputDiff](../src/lib/outputDiff.ts) | 标准输出保持原样，程序输出差异标红；保留原始文本复制和评测允许的空白规则 |
| 编程提交结果（2026-10-07 本地新增） | [ProgrammingSubmissionResult](../src/components/ProgrammingSubmissionResult.tsx) | “通过了 / 未通过”与简短原因；统计合并一行，详情由原角色路径进入 |
| 空状态 | [AcademyEmptyState](../src/components/AcademyEmptyState.tsx) | 学生页复用插画，后台使用 `compact` 图标版；插画记录见 [素材说明](ui-assets.md) |
| 共用样式与交互层级 | [globals.css](../src/app/globals.css) | 卡片 12px，按钮 / 输入 / 筛选 7px；长文本换行、焦点、触屏和减少动态效果统一维护 |

扩大点击区域时，外层行或卡片使用 `.problem-entry`，主入口使用 `ProblemEntryLink` 的 `.problem-entry-link::after` 覆盖主体；其余链接、按钮和表单控件处于更高层，继续执行各自操作。保留原生链接语义，不嵌套链接，不使用整行 `onClick` 替代导航。链接等待超过 100ms 后显示加载反馈，减少动态效果设置继续生效。

题目完成或通过状态与当前选中状态分别由 `data-accepted`、`data-active` 表达；专项题单的绿色表示本次任务题已完成，不据此改变日常题库的历史通过统计。权限、查询、计数及任务进度仍在原页面或服务端处理。

## 按功能保留的差异

- 老师与管理员共用后台展示，但鉴权、考试归属和可见账号范围保持原规则。
- 学生列表统计自己的提交，后台保留原全局日常提交计数；后台的“查看通过代码 / 答案”快捷入口继续可用。
- 提交记录链接、复选框、拖拽排序、添加、编辑、发布等独立控件执行原操作；点击这些控件不会进入题目。
- 错题本继续携带 `fromSubmission`，专项练习继续携带 `assignment`，后台考试练习继续携带 `problemId`。
- 学生正式考试继续使用原顶部题签、倒计时、切题和退出保护；未新增普通导航。
- 没有修改 API、数据库 schema、迁移、Judge、AI 策略、积分或任务进度规则。

## 验证

浏览器测试采用一次性 `prisma/e2e.db` 与测试账号，覆盖三端的标题、分类、难度和空白区域点击，以及独立入口、Enter、新标签页、触屏和减少动态效果。三端题库与长标题详情检查了 320、768、1280、1440px；提交、考试、作业、学情、公告、反馈等常用页面检查了 320 和 1280px，宽表格只在自身容器内滚动。另验证分类切换、编程与选择判断题入口、分页、通过状态、空列表和手机退出按钮。

2026-10-02 本地验证结果：

| 检查 | 结果 |
| --- | --- |
| `npm run test` | 124 个文件、667 项测试通过 |
| `npm run test:e2e` | 完整 16 项通过，包含新增的 4 项 UI 流程与原考试、任务、权限、公告、反馈、奖励回归 |
| UI 最终复查 | 分页与截图复测 4 项通过；样例标题统一后，题目详情、后台考试练习及核心考试流程复测 3 项通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run lint` | 通过 |
| `npm run build` | 通过；使用独立的 `.next-e2e` 输出目录，保留正在运行的本地开发服务 |
| 离线截图图集 | 13 张图片全部加载；320 / 1280px 无主体溢出，无脚本错误或外部网络请求 |
| 本地服务 | `http://127.0.0.1:3000/api/health` 与登录页均返回 200 |

浏览器测试结束后已清理一次性数据库和测试产物；构建与测试自动生成的 TypeScript 配置已恢复。后续 Linux 构建及正式发布验证也已通过。

## 对比截图

[打开截图图集](ui-unification-2026-10-02/index.html)。图集包含三端题库桌面与手机截图、题目详情、错题本、后台考试练习和管理员手机设置页。截图使用隔离测试数据，特意包含超长标题以验证换行，不代表服务器当前内容。
