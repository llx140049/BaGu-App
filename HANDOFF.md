# BaguApp 开发交接文档

更新时间：2026-07-16
当前分支：`master`
最近已提交：`b035181 feat: 支持题目多标签学习范围`

> 当前工作区是 **dirty worktree**。本轮 UI 与学习计划功能已实现但尚未提交；继续开发时必须保留这些改动，不要使用 `git reset --hard`、`git checkout --` 等清理命令。

## 1. 项目定位与技术栈

BaguApp 是一款本地优先的移动端学习卡片 App，包含题库、文档库、学习计划、翻卡学习、收藏和错题复习。

- 前端：Expo Router + React Native + TypeScript
- 本地数据：Android 使用 Expo SQLite；Web 使用 `localStorage` 模拟数据库
- 后端：FastAPI + SQLite，负责登录、上传、题目生成与同步
- UI 基调：Apple Settings / Things 3 / Goodtime / Bear；白（浅灰）底、简洁列表、少量暖橙色强调，不做后台管理式大卡片
- 图标：统一使用 `lucide-react-native`
- 字体：`MiSans-Regular`、`MiSans-Medium`、`MiSans-Semibold`；首页数字另使用 `Inter-Light`

`app/(tabs)` 只是历史目录名，实际是 Stack 路由，**没有底部 Tab Bar**。

## 2. 运行与验证

### 前端

```powershell
cd C:\Users\18253\Documents\BaguApp\frontend
npm.cmd run start
```

常用类型检查：

```powershell
cd C:\Users\18253\Documents\BaguApp\frontend
npx.cmd tsc --noEmit
```

截至本次交接，以上 TypeScript 检查已通过。

### 后端

```powershell
cd C:\Users\18253\Documents\BaguApp\backend
venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

健康检查：`http://localhost:8001/api/health`

Android 真机调用 API 的地址在 `frontend/src/services/api.ts`；换网络后需要更新局域网 IP 或设置 `EXPO_PUBLIC_API_URL`。

## 3. 当前路由与页面状态

| 路由 | 文件 | 当前职责 |
| --- | --- | --- |
| 首页 | `frontend/app/(tabs)/index.tsx` | 极简待学习数量与“开始学习”，左下弱化菜单 |
| 知识库 | `hub.tsx` | 今日学习摘要、题库、文档库、统计、设置、帮助入口 |
| 题库 | `questions.tsx` | 一级标签列表；有二级标签时先进入二级标签列表，否则直接题目列表 |
| 标签/题目列表 | `topic.tsx` | 题目列表、长按批量操作、右上学习入口、进入编辑题目 |
| 编辑题目 | `question-editor.tsx` + `src/components/QuestionEditor.tsx` | 独立编辑页、标签 Chips、Markdown/LaTex 预览、更多菜单 |
| 学习计划 | `study-plan.tsx` | 今日进度/待复习、学习范围、内容选择、低频设置菜单 |
| 单项计划设置 | `study-plan-item.tsx` | 单个一级/二级标签的计划设置；关闭加入计划会移除该项 |
| 翻卡学习 | `study.tsx` | 新学、复习、收藏、错题等范围学习；手势评分 |
| 文档库 | `documents.tsx` | 文件夹与文档浏览 |
| 文档阅读 | `doc-reader.tsx` | Markdown、LaTeX、PDF 阅读 |
| 收藏/错题/复习 | `collection.tsx` | 列表、编辑、长按批量操作、右上开始学习 |
| 学习统计 | `stats.tsx` | 学习记录统计 |
| 设置/我的 | `settings.tsx` | 轻量列表入口、每日新题目标、深色模式 |

所有页面已在 `frontend/app/(tabs)/_layout.tsx` 注册。根布局 `frontend/app/_layout.tsx` 负责安全区、Web 手机画布与字体加载。

## 4. 最近完成的产品与 UI 约定

### 知识库首页

- 标题下有 `TodayStudyCard`（`src/components/TodayStudyCard.tsx`），点击进入学习计划。
- 卡片展示为 `已学习数 /（今日待学习数 + 待复习数）`，不显示“已学习/待学习”文字。
- 卡片底部保持学习范围名称（最多 3 项，超出显示“等 N 项”），不要替换为待学习/复习数。
- 卡片不再显示“查看计划”；右箭头即可表达可进入。
- 题库与文档库是一级入口；统计、设置、帮助是次级入口。无大分组卡片、无明显阴影。

### 学习计划

- 顶部仅保留两组核心信息：
  - 左侧：`已完成 / 每日目标`，下方橙色“今日进度”与橙色实心三角。
  - 右侧：待复习数量，下方蓝色“待复习”与蓝色实心三角。
- 橙色三角启动学习计划标签范围内的**新卡片**；蓝色三角启动同一范围内的**到期复习卡片**。
- 页面主区标题为“学习范围”；每项只显示标签名和“今日完成 n / n”，不再显示“n 张/天”。
- 点击“添加学习内容”先选一级标签，再选择“全部一级标签”或一个二级标签；标签最大两级。
- 不加入计划的内容在单项设置页关闭后会直接从计划列表移除。
- 右上 `⋯` 仅收纳“学习方式”和“重置学习进度”；重置带二次确认。
- 已删除原来的底部“待复习”板块、重复目标设置与底部学习方式设置。

### 题库、标签与批量操作

- 题目支持多标签：`questions.tags` 为 JSON 字符串数组，格式如 `一级/二级`；`cat` 仅兼容旧数据和默认主标签。
- 一级标签学习范围包含它的直系二级标签；学习页按题目 ID 去重。
- 标签详情右上三角会打开学习范围 Bottom Sheet；题目列表支持长按进入批量操作。
- 批量模式触发背景为浅灰，取消文字为黑色。
- 题目下方显示该题目的标签，而非“题目”占位文字；标签使用 Lucide 的 Tag 图标。

### 编辑题目

- 不使用大型 Bottom Sheet，编辑为独立页。
- 顶部：`返回 / 编辑题目 / ⋯ / 完成`；“完成”保存并返回。
- 无底部保存、取消、删除栏。返回存在修改时提示放弃修改。
- `⋯` 菜单：收藏、复制题目、删除题目（删除二次确认）。
- 标签采用已选 Chips + “添加标签”；不展示全局标签管理表单。
- 题目、答案分别是浅灰容器（无显著阴影）；答案支持 Markdown/LaTeX 编辑与预览。

### 收藏、设置与图标

- 收藏夹样式沿用题库页：可单击编辑、长按批量操作、右上三角学习。
- 收藏列表中的图标是“取消收藏”语义（`StarOff`），不是普通收藏状态。
- 设置页使用轻量 Section/list：学习工具、账号、学习设置、外观；每日目标以 Bottom Sheet 选择 5/10/20/30/50 题；保留深色模式。
- 项目中需要图标的位置已改用 Lucide，不应再添加 Unicode/文本占位图标。

## 5. 学习计划与学习范围数据实现

核心文件：`frontend/src/data/study-plan.ts`

```ts
interface StudyPlanItem {
  id: string;
  tag: string;        // "一级" 或 "一级/二级"
  dailyTarget: number;
  enabled: boolean;
  mode: "smart";
  range: "all";
}

interface StudyPlan {
  dailyTarget: number;
  items: StudyPlanItem[];
}
```

- 计划持久化在 `app_settings`，key 为 `study_plan`。
- `getTodayStudySummary()` 使用当天 `study_records.count` 作为已学习数量。
- `getPlanReviewCount()` 统计已加入计划范围内、到期且未掌握的卡片。
- `getTodayItemProgress()` 依据当天 `last_review` 统计各范围完成数；一级标签会包含下级标签。
- `study-plan.tsx` 点击三角时传递 `planTags` JSON 到 `study.tsx`。
- `study.tsx` 解析 `planTags`，与 `topic` 条件共同筛选后，再应用 `new` 或 `review` scope。因此后续修改学习入口时必须保留该过滤链路。

注意：当前“今日进度”的 `已完成` 使用当天总 `study_records.count`，其中可能包含复习；用户已经明确：顶部 `/ N` 的 `N` 只应是今日待学习目标，不包含待复习数。

## 6. 关键数据与工具文件

```text
frontend/src/data/tagging.ts          标签解析、规范化、父子范围匹配
frontend/src/data/study-plan.ts       计划持久化与今日统计
frontend/src/data/db.ts               Native SQLite 初始化/迁移
frontend/src/data/db.web.ts           Web localStorage SQL 适配
frontend/src/data/sm2.ts              复习到期与评分逻辑
frontend/src/store/useCardStore.ts    翻卡会话状态
frontend/src/tokens/colors.ts         全局颜色 Token
frontend/src/components/PrototypeUI.tsx  BackButton 等基础 UI
frontend/src/components/StudyScopeBottomSheet.tsx  标签页学习范围选择
frontend/src/components/QuestionEditor.tsx  编辑题目内容与预览
```

`questions` 关键字段：

```text
id, user_id, cat, q, a, source, source_document_id, tags, created_at
```

标签规则：

- `tags` 是正式多标签来源，JSON 数组。
- 路径最多两级：`一级` 或 `一级/二级`。
- 旧数据无 `tags` 时自动回退为 `cat`，无需手工迁移。
- 保存题目时 `cat` 同步为 `tags[0]`，保证旧流程兼容。

## 7. 已知限制与下一轮建议

1. **优先真机验证学习计划三角入口**：建立含一级、二级标签的计划，分别点击橙/蓝三角，确认新学与到期复习都只出现计划范围内卡片。
2. `study_records.count` 目前是总完成数；若未来需要严格区分“新学完成”和“复习完成”，需扩展统计字段或查询口径，避免只靠总数。
3. 多标签目前主要是本地能力。跨设备同步前，需要审查后端 `Question` 序列化与 `sync` push/pull 是否完整携带 `tags`。
4. Markdown/LaTeX 编辑预览已实现，但长公式、复杂表格和 Android 真机输入体验仍应回归测试。
5. 深色模式已保留入口，但新加页面的逐项深色视觉还需持续检查。
6. 避免引入大型 UI 库；优先使用现有 React Native 组件、现有 Token 与 Lucide。

## 8. 工作区约束

当前未跟踪的本地内容，保留但不要提交：

```text
.tmp-goodtime/
backend/bagu.db
design/
```

当前还有一批与本轮 UI、学习计划相关的未提交前端改动，属于继续开发的基线。提交前建议：

```powershell
git status --short
git diff --check
git add frontend HANDOFF.md
git diff --cached --check
git commit -m "feat: 完善学习计划与知识库体验"
```

除非用户明确要求，不要提交数据库、临时素材，且不要清理已有 dirty worktree。

## 9. 新对话可直接使用的提示词

```text
请先阅读 C:\Users\18253\Documents\BaguApp\HANDOFF.md，并检查 git status。
在现有 dirty worktree 上继续开发，保留所有未提交改动；不要提交或删除 backend/bagu.db、.tmp-goodtime、design。
这是 Android 优先的 Expo App，先理解现有实现并做最小范围修改。完成后运行：
cd frontend; npx.cmd tsc --noEmit
```
