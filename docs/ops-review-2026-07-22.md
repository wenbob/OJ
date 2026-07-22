# 2026-07-22 管理员题目与分类排序上线记录

## 上线范围

- 管理员题目管理页新增题目自定义顺序、标题自然升降序、创建时间正倒序。
- 自定义模式支持当前页拖动和上下移动；上下按钮继续支持跨分页移动。
- 分类标签支持拖动或上下调整草稿，确认后统一保存；编程题和选择判断题分别维护。
- 标题或时间排序默认只用于管理员预览，管理员可以把当前题型或分类的全部分页结果保存为一次性自定义题序快照。
- 学生端不显示排序入口；学生题库、管理员题目练习和组卷搜索只读跟随管理员保存的题目及分类顺序。
- 新建题目置顶；Markdown 批量导入整批置顶且保持文档题序；修改题型后进入目标题型最前。

拖动完成后的连续操作问题也在本次发布前修复：开始第二次拖动时不再清除成功提示，避免提示条消失造成表格位移并让浏览器丢失拖动目标；成功后保留乐观顺序并立即释放拖动状态，失败时仍从服务器回滚。

## 数据库与接口

新增迁移：

```text
0010_problem_custom_ordering
```

- `Problem.sortOrder` 保存题目顺序，数值越大越靠前；迁移按现有题目 ID 回填，保持原来的新题优先。
- `ProblemCategoryOrder` 按 `problemType + category` 唯一保存分类顺序。
- 新增题目顺序索引和分类顺序索引。
- 管理接口为 `POST /api/admin/problems/order`、`POST /api/admin/problems/order/apply` 和 `POST /api/admin/problems/categories/order`，均要求管理员权限。

## 本地验证与 Linux 构建

- `npm run test`：63 个测试文件、296 项测试通过。
- `npx tsc --noEmit`、`npm run lint` 和 Prisma schema 校验通过。
- Docker `node:22-bookworm-slim` 受限为 2GB 内存、Node 堆 1GB；容器内从空 SQLite 成功应用全部 10 个迁移并完成 Next standalone 构建。
- 发布包大小为 49,832,616 字节，SHA-256 为 `7cdeaec7dc291f9b92640b795c7a62c9206e68eeb79ca799dbaec4d0678cd91f`。
- 归档不含 `.env`、数据库、根 `node_modules`、`.next/cache` 或嵌套压缩包，仅包含 `libquery_engine-debian-openssl-3.0.x.so.node`。

## 生产发布与回滚点

- 发布前有效 `in_progress` 考试为 0。
- 生产数据库备份：`/www/backups/prod-20260722-145240-before-problem-ordering.db`。
- 旧版本回滚目录：`/www/oj-old-20260722-145240`。
- 依赖锁文件没有变化，服务器复用原有根 `node_modules`。
- 服务器没有执行 `npm ci`、Next.js 构建、`seed` 或数据库初始化；停服备份并切换目录后，仅执行 `npm run db:deploy` 应用 `0010`。

切换前后数据计数一致：

```text
用户 27
题目 1060
提交 1436
测试点 1755
```

## 线上验收

- PM2 `oj` 在线，应用只监听 `127.0.0.1:3000`。
- 本机和公网 `/api/health` 均返回数据库正常。
- 登录页引用的 14 个 `_next/static` 资源全部返回成功，基础安全响应头齐全。
- 未登录管理员题目查询和排序写入分别返回 401、403，确认排序入口保持管理员权限。
- SQLite `quick_check` 为 `ok`，`0010` 已完成，两个排序索引存在，迁移回填结果完整。
- Docker Judge 使用生产镜像成功编译并运行最小 C++17 程序，冒烟输出为 `42`。

## 清理边界

- 保留本次数据库备份和旧版本回滚目录。
- 验收完成后只清理本次发布压缩包和临时检查文件。
- 不清理其它站点、股票系统、Docker 全局缓存、镜像或 volume。
