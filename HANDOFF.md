# BaguApp 项目交接文档

> 更新时间：2026-07-20
>
> 当前分支：`master`
>
> 适用范围：继续本地开发、Android 真机联调和 MVP 收尾
>
> 信息来源：当前仓库、Git 历史、2026-07-11 至 2026-07-19 的 Codex 原始开发记录

## 1. 接手先读

BaguApp 是一款 Android 优先的面试八股学习 App。核心闭环是：

1. 导入 PDF、Markdown 或文本；
2. 保存可阅读的原文；
3. 使用 DeepSeek 生成题目与标签；
4. 通过题库、收藏、错题和 SM-2 翻卡复习；
5. 用学习计划和统计查看进度；
6. 登录后在不同设备间同步本地学习数据。

项目目前处于“功能型 MVP 向稳定 Beta 过渡”阶段：

- 核心功能完整度约 75%～80%；
- 可以进行内部演示和真机测试；
- 尚不适合多用户生产部署；
- 当前最重要的工作不是扩功能，而是完成真机回归、补最小测试并固化未提交改动。

### 工作区保护规则

当前是 **dirty worktree**，包含已实现但尚未提交的功能。接手时必须保留现有修改。

禁止在未确认范围前执行：

- `git reset --hard`
- `git checkout --`
- 批量清理或删除未跟踪目录

特别不要删除：

- `frontend/android/`
- `backend/bagu.db`
- `backend/venv-runtime/`
- `.tmp-goodtime/`
- `design/`

不要把数据库、虚拟环境、日志和临时素材提交到 Git。

## 2. 当前 Git 状态

最近提交：

- `222ac24 feat: add persistent theme and polish study UI`
- `8838660 feat: improve import tags and library management`
- `d623665 feat: 完善学习计划与文档库体验`
- `7c78c97 feat: 支持保真 PDF 导入与原文件阅读`
- `2345095 fix: 同步已有题目的标签更新`

当前已跟踪但未提交的修改主要涉及：

- `backend/app/api/v1/upload.py`
- `backend/app/services/deepseek.py`
- 题库、收藏、文档库、题目编辑和学习页
- 导入流程、文件选择器、题目编辑器和学习范围弹层
- `frontend/src/data/study-plan.ts`

最近一次核查时，已跟踪改动约为 313 行新增、76 行删除。提交前应重新执行 `git status --short`，并按功能拆分提交。

## 3. 技术栈与真实运行状态

| 层级 | 当前实现 |
| --- | --- |
| 前端 | Expo SDK 54、React Native 0.81.5、React 19、TypeScript、Expo Router |
| 状态管理 | Zustand |
| 本地数据 | Native 使用 Expo SQLite；Web 使用 localStorage 适配层 |
| 后端 | FastAPI、SQLAlchemy、Alembic |
| 当前开发数据库 | SQLite：`backend/bagu.db` |
| AI | DeepSeek `deepseek-chat` |
| PDF 文本/Markdown | `pdfplumber`、`pymupdf4llm` |
| Android PDF 阅读 | `react-native-pdf`、`react-native-blob-util` |

README 中的 Expo 57、React Native 0.86、DeepSeek V4 和完整 Supabase 描述已过期，不应作为当前实现依据。

### 当前数据架构的限制

- 业务文档、题目和进度主要进入 SQLAlchemy 数据库；
- 登录账号保存在服务端本地 `uploads/_sync/users.json`；
- 部分同步数据按用户保存在 JSON 文件；
- Supabase 配置存在，但当前本地 MVP 并未形成完整的 Supabase 生产链路。

这套方案适合单机开发和内部演示，不适合直接部署为正式多用户服务。

## 4. 启动与真机联调

### 推荐一键启动

在项目根目录执行：

```powershell
cd C:\Users\18253\Documents\BaguApp
.\start-dev.ps1
```

脚本会：

- 启动 FastAPI：`8001`
- 启动 Metro：`8081`
- 检测 Android 设备
- 配置 `adb reverse` 端口转发

### 手动启动后端

```powershell
cd C:\Users\18253\Documents\BaguApp\backend
.\venv-runtime\Scripts\python.exe -m alembic upgrade head
.\venv-runtime\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

健康检查：

```text
http://127.0.0.1:8001/api/health
```

API 文档：

```text
http://127.0.0.1:8001/docs
```

### 手动启动前端

```powershell
cd C:\Users\18253\Documents\BaguApp\frontend
npx.cmd expo start --offline
```

然后执行：

```powershell
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8001 tcp:8001
adb reverse --list
```

### 手机卡在启动页时

历史上最常见原因是 USB 重连后 `adb reverse` 丢失，而不是业务代码崩溃。

依次检查：

1. `adb devices` 是否显示 `device`；
2. Metro 的 `8081` 是否监听；
3. 后端的 `8001` 是否监听；
4. `adb reverse --list` 是否包含两个端口；
5. 完全关闭手机 App 后重新打开。

## 5. 已实现的核心功能

### 导入与 AI

- 支持 `.pdf`、`.md`、`.markdown`、`.txt`、`.text`；
- 最大上传大小为 100MB；
- 支持仅保存原文，或保存原文并生成题目；
- 导入前可预览、编辑分类和标签；
- AI 会生成题目标签和文档标签；
- 题目标签会参考已有标签，避免同义标签过度分散；
- Markdown Q/A 导入包含保守的题目/答案倒置修复；
- AI 答案要求输出结构化 Markdown；
- 长文已开始按章节分段生成、合并和去重，但仍需实际大文档回归。

上传接口仍名为 `POST /api/v1/upload/pdf`，实际上同时处理 PDF、Markdown 和 TXT。暂时不要为命名做无关重构。

### 文档库

- 文件夹层级、搜索和最近打开；
- 长按多选和批量删除；
- 可选择是否删除关联题目；
- 文档分类/保存路径修改；
- Markdown/LaTeX 阅读；
- 正文编辑与预览切换；
- 阅读进度保存；
- 深色模式；
- PDF 原始文件保存与 App 内阅读。

### PDF 转 Markdown

- 使用 `pymupdf4llm.to_markdown(..., write_images=True)`；
- 图片保存到 `backend/uploads/{file_id}-assets/`；
- Markdown 使用 `{{API_BASE}}` 占位符引用图片；
- 前端阅读器会替换实际 API 地址；
- 保留原始 PDF，可通过“阅读原文件”打开；
- 原始文件接口需要 JWT。

关键接口：

- `GET /api/v1/documents/{document_id}/original-file`
- `GET /api/v1/documents/document-assets/{asset_dir}/{filename}`

### 题库与学习

- 题目多标签；
- 文件夹/标签层级；
- 收藏和错题集合；
- 搜索；
- 长按批量收藏、删除；
- 导出前进入独立多选模式；
- 支持全选、取消全选和逐题选择；
- Markdown/JSON 导出；
- SM-2 复习进度；
- 学习范围选择；
- 学习计划重置与目标同步。

“已掌握”的当前口径是题目 SM-2 `level >= 5`。

### 翻卡答案

答案曾使用 WebView 渲染 Markdown，但出现无法滚到底和深色背景不一致的问题，现已改为原生轻量 Markdown 渲染。

当前支持：

- 标题
- 粗体
- 列表
- 引用
- 换行

当前限制：

- 复杂表格未完整支持；
- LaTeX 未完整支持；
- Markdown 图片未完整支持。

### 统计

- 总体学习数据；
- 连续学习天数；
- 日历和趋势；
- 标签做题进度；
- 标签进度按一级标签聚合；
- 区分“已做”和“已掌握”。

### 主题

- 浅色/深色主题可持久化；
- 主题存入本地 `app_settings.theme`；
- 首页、题库、收藏、文档库、学习、统计、设置和学习计划等主要页面已适配；
- Markdown WebView 会根据主题生成对应 HTML/CSS；
- 长按选择态已针对深色模式修复。

## 6. 登录、数据库与同步

### 已处理的问题

历史上出现过两类“登录失败”：

1. 手机仍访问旧局域网 IP，登录请求没有到达后端；
2. SQLite 并发初始化触发 `NativeDatabase.prepareAsync` 和 `NullPointerException`。

SQLite 问题已通过共享单一 `dbPromise` 修复：所有调用等待同一次数据库初始化和迁移完成。

### 当前同步行为

- 登录前会尝试同步旧账号；
- 切换账号后清空本地题库和文档库；
- 再拉取新账号数据；
- 退出登录后本地账号数据应被隔离/清空；
- 支持题目、进度、文档、设置和学习记录同步。

### 正式部署前必须修复

- 将账号与同步 JSON 迁移到数据库；
- 密码改用成熟哈希方案，如 Argon2 或 bcrypt；
- 更换默认 `SECRET_KEY`；
- 限制 CORS；
- 增加并发、事务、备份和数据恢复策略；
- 不要使用默认数据库连接串或开发密钥。

## 7. 已验证状态

2026-07-20 本地核查结果：

- `npx.cmd tsc --noEmit`：通过；
- Python `compileall`：通过；
- Alembic：`20260717_03 (head)`；
- FastAPI `/api/health`：返回 200；
- Git `diff --check`：无空白错误，仅有 LF/CRLF 提示。

历史对话中已确认：

- Android 开发包曾成功构建和安装；
- 原始 PDF 曾在真机成功显示；
- `adb reverse` 恢复后 App 可重新启动；
- 导出多选的全选、取消全选、逐题选择和长按冲突经过多轮反馈修复；
- SQLite 初始化竞争已定位并修复；
- 深色模式和 Markdown 阅读经过多轮界面反馈修复。

这些记录不能替代当前版本的完整回归测试。

## 8. 尚未完成或必须回归

### P0：形成稳定 Beta

1. Android 真机完整跑通：
   - 登录；
   - 导入含图片 PDF；
   - 生成题目；
   - 图片加载；
   - 文档阅读；
   - 原 PDF 阅读；
   - 翻卡学习；
   - 同步、退出和重新登录。
2. 确认 PDF 图片接口返回 200，且 URL 没有被重复拼接；
3. 验收长文滚动、MiSans 字体、代码块和深色模式；
4. 将当前未提交代码按功能拆分提交。

### P1：最小测试

至少增加：

- 注册/登录冒烟测试；
- 导入预览与确认测试；
- 文档/题目删除及关联关系测试；
- 同步 push/pull 测试；
- SM-2 和学习计划重置测试；
- 一条端到端核心链路测试。

### P2：工程化与生产准备

- 统一 API 地址配置，去除局域网 IP 硬编码；
- 更新 README；
- 增加 CI；
- 将认证和同步迁移到正式数据库；
- 增加错误日志、监控和备份；
- 再考虑 `.docx` 导入、通知、分享等扩展功能。

## 9. 当前明确不支持

- `.doc` / `.docx`
- PPT
- Excel
- 图片 OCR 导入
- GBK 等非 UTF-8 文本编码探测
- 翻卡答案中的完整 LaTeX、复杂表格和图片

不要在未确认产品优先级前为这些能力引入大型依赖。

## 10. 最小检查清单

```powershell
cd C:\Users\18253\Documents\BaguApp
git status --short
git diff --check

cd frontend
npx.cmd tsc --noEmit

cd ..\backend
.\venv-runtime\Scripts\python.exe -m compileall -q app migrations
.\venv-runtime\Scripts\python.exe -m alembic current
```

真机联调：

```powershell
adb devices
adb reverse --list
```

## 11. 接手后的推荐顺序

1. 阅读本文档；
2. 执行 `git status --short`，不要清理现有修改；
3. 执行最小检查清单；
4. 使用 `start-dev.ps1` 恢复开发环境；
5. 优先完成含图片 PDF 的真机核心链路回归；
6. 记录失败步骤、完整错误和后端日志；
7. 只做最小范围修复；
8. 验证通过后按功能拆分提交。

## 12. 历史记录位置

旧 Codex 原始对话备份位于：

```text
C:\Users\18253\codex备份
```

主要索引与记录：

- `session_index.jsonl`
- `sessions/**/*.jsonl`
- `archived_sessions/*.jsonl`
- `attachments/`

这些文件包含完整聊天、工具调用、修改过程和最终结果。需要追溯某个设计决定或真机故障时，应按会话 ID和日期读取相关 JSONL；不要复制或公开其中的认证、环境和隐私信息。
