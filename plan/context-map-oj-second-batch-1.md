## Context Map

### Files to Modify

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/app/api/problems/[id]/objective-explanation/route.ts` | 学生选择判断题 AI 入口 | 将考试限制改为账号级有效进行中考试锁；幂等查询携带题目、考试、模式和小题上下文 |
| `src/lib/aiUsageAudit.ts` | AI 请求审计与 `requestId` 幂等重放 | 校验同一 `requestId` 的账号、题目、考试、作用域、模式、AI 类型和客观题序号；把上下文冲突与跨账号访问统一拒绝 |
| `src/lib/problemAiAssistRoute.ts` | 学生和后台编程题 AI 入口 | 在重放历史请求前传入服务端解析后的题目、考试、作用域和模式上下文 |
| `src/components/StartExamButton.tsx` | 学生开始或继续考试 | 用 `try/catch/finally` 保证网络异常后恢复按钮并展示安全错误 |
| `src/components/ExamSubmitButton.tsx` | 学生交卷 | 用 `try/catch/finally` 保证网络异常后恢复按钮并展示安全错误 |
| `src/app/admin/exams/exam-form-client.tsx` | 创建和编辑考试 | 统一处理请求异常并在 `finally` 恢复保存状态 |
| `src/app/admin/exams/exam-list-client.tsx` | 发布、结束和删除考试 | 统一处理请求异常，避免操作失败后页面无反馈 |
| `src/app/admin/exams/exam-edit-client.tsx` | 搜索、添加、更新和移除考试题目 | 为所有异步操作增加异常恢复并保持现有成功路径 |
| `src/app/admin/problems/problem-manager.tsx` | 管理员题目管理容器 | 抽离类型、常量和纯展示控件，减少单文件职责但不改变数据流 |
| `src/app/admin/settings/settings-form.tsx` | 管理员系统与 AI 设置容器 | 抽离 AI 配置编辑器、提示词编辑器和通用输入控件 |
| `src/app/admin/problems/problem-manager-support.tsx` | 新增的题目管理支持模块 | 承载共享类型、默认表单、排序标签和纯输入控件 |
| `src/app/admin/settings/settings-form-sections.tsx` | 新增的设置页展示模块 | 承载 AI 服务商、提示词、冷却时间和通用字段组件 |

### Dependencies (may need updates)

| File | Relationship |
|------|--------------|
| `prisma/schema.prisma` | 现有 `AiConversation` 和 `AiConversationTurn` 已包含所需上下文字段；本批不需要迁移 |
| `src/lib/examScoring.ts` | 提供考试时限判定；账号级 AI 锁复用同一时间边界语义 |
| `src/lib/objectiveAiExplanationWorkflow.ts` | 客观题 AI 路由在通过权限和幂等检查后调用该工作流 |
| `src/lib/aiProvider.ts` | 两种 AI 入口在幂等检查后读取服务配置并调用上游 |
| `src/lib/objectiveProblem.ts` | 题目管理支持模块继续复用客观题类型与校验函数 |
| `src/lib/problemOrdering.ts` | 题目管理支持模块继续复用排序与拖拽类型 |
| `src/lib/settings.ts` | 设置页拆分组件继续使用现有设置键、默认值和冷却约束 |

### Test Files

| Test | Coverage |
|------|----------|
| `src/lib/aiUsageAudit.test.ts` | 跨账号和跨题目、考试、作用域、模式、小题的 `requestId` 重放拒绝 |
| `src/app/api/problems/[id]/objective-explanation/route.test.ts` | 任意有效进行中考试均禁止学生调用客观题 AI；上下文传递正确 |
| `src/app/api/ai/problem-assist/route.test.ts` | 编程题重放绑定服务端解析后的考试和模式上下文 |
| `src/components/ExamActionButtons.test.tsx` | 开始考试与交卷网络异常后恢复可操作状态并显示错误 |
| `src/app/admin/exams/exam-clients.test.tsx` | 后台考试关键操作的网络异常恢复 |
| `src/app/admin/problems/problem-manager.test.tsx` | 拆分后题目排序和表单行为保持不变 |
| `src/app/admin/settings/settings-form.test.tsx` | 拆分后 AI 提示词和配置控件保持不变 |

### Reference Patterns

| File | Pattern |
|------|---------|
| `src/components/ProblemRunPanel.tsx` | 使用 `try/catch/finally` 恢复 `pending` 的客户端请求模式 |
| `src/components/ProblemAiAssist.tsx` | 将传输异常转换为用户可读错误并在 `finally` 清理状态 |
| `src/lib/examScoring.ts` | `isExamSubmissionOnTime` 定义无时限和截止边界语义 |
| `src/app/admin/assignments/assignment-publishing-workspace.tsx` | 后台表单捕获异常并保持页面可继续操作的模式 |

### Risk Assessment

- [x] Breaking changes to public API: 同一账号复用 `requestId` 但上下文不同将由错误重放改为 409 拒绝；正常客户端请求不受影响。
- [ ] Database migrations needed: 现有审计表字段足够，本批不新增字段。
- [ ] Configuration changes required: 核心修复和组件拆分不需要配置变化；浏览器级回归优先复用现有依赖，若缺少运行条件则保留为可执行测试资产并明确说明。

### Review Result

- 2026-08-09 已复核：安全改动可在现有数据模型内完成；组件拆分限定为纯类型、常量与展示组件迁移，不改 API、路由或持久化行为。
