# BaguApp 开发交接文档

更新日期：2026-07-15
当前分支：`master`

## 1. 项目定位

BaguApp 是一个面向知识学习/八股复习的 Expo + FastAPI 应用，核心闭环为：

1. 上传 PDF / Markdown / 文本文件；
2. 可选 AI 生成题目，确认后保存原文与题目；
3. 在文档库阅读原文、在题库学习题目；
4. 本地数据可手动同步到后端，并在 Web 与手机端间同步。

## 2. 架构与目录

```text
BaguApp/
├─ backend/                 FastAPI + SQLAlchemy + Alembic
│  ├─ app/api/v1/           auth、upload、sync、questions、documents 等接口
│  ├─ app/models/           User / Document / Question 等模型
│  ├─ app/services/         PDF / Markdown 提取、DeepSeek 生成题目
│  └─ migrations/           Alembic 迁移
├─ frontend/                Expo Router + React Native / Web
│  ├─ app/(tabs)/           首页、题库/文档库、学习、统计、设置
│  └─ src/
│     ├─ components/        上传、题目编辑、Markdown 渲染组件
│     ├─ data/              原生 SQLite 与 Web localStorage 数据库适配
│     └─ services/api.ts    API、鉴权 token、上传与同步请求
└─ HANDOFF.md               本文件
```

## 3. 本地启动

### 后端

在项目根目录打开 PowerShell：

```powershell
cd backend
venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

若启动提示 `No module named 'greenlet'`：

```powershell
venv\Scripts\python.exe -m pip install -r requirements.txt
```

健康检查：`http://localhost:8001/api/health`。

### 前端

```powershell
cd frontend
npm start
```

Web 端通常为 `http://localhost:8081`。手机使用 Expo Go 时，后端须监听 `0.0.0.0:8001`。

手机 API 地址当前写在 `frontend/src/services/api.ts`：

```ts
const HOST = Platform.OS === "web" ? "localhost" : "192.168.2.11";
```

换网络或电脑 IP 后必须修改这里，或设置 `EXPO_PUBLIC_API_URL`。

## 4. 数据与同步模型

- 原生端：`expo-sqlite`，数据库为 `bagu-memory.db`。
- Web 端：`frontend/src/data/db.web.ts`，使用 localStorage 模拟表结构。
- 后端：开发环境默认 SQLite（`backend/bagu.db`），上传确认后的文档原文以数据库为权威来源。
- 同步接口：`/api/v1/sync/push`、`/pull`，同步缓存保存在上传目录的 `_sync/<user-id>/` 下。
- Web 登录 token 存在 `localStorage`；手机 token 存在 `app_settings`，由 `api.ts` 自动恢复。

重要：同步不是实时的，需要在设置页主动点击同步。删除与目录修改已添加专用云端接口，避免下一次同步把旧数据恢复。

## 5. 已完成的功能

### 基础学习闭环（已提交）

- 首页：待复习/新题/每日目标。
- 文档库、阅读进度、题库、学习、收藏/错题、统计。
- 登录、手动同步、Alembic 初始化迁移。
- Web 与手机端上传文件。

### 上传与原文（已提交）

- 上传 PDF / `.md` / `.txt`。
- 每个文件选择“仅导入原文”或“生成题目”。
- 生成后可编辑/删除预览题目再确认。
- 原文保存到文档库；同步不会再把原文覆盖成 Q/A 汇总。
- 手机端鉴权 token 持久化，修复上传确认 403。

### 本轮未提交功能

- 文档、题目长按进入多选；批量删除。
- 删除文档时选择保留关联题目，或连题目与学习进度一起删除。
- 题目/文档批量删除先删除云端，再删除本地，防止同步复活。
- 移除常态“管理”按钮，页面保持简洁。
- 停止自动填充内置示例数据；旧示例需用户手动长按删除。
- 分类路径目录浏览：`高等数学/多元函数/微分学` 会显示为逐级目录。
- 文档阅读页“整理目录”：修改文档路径会同步移动关联题目。
- 题目编辑、上传预览支持选择已有目录或输入新路径。
- 上传确认时文档与生成题目直接进入所选目录。
- 原生文件选择与后端均会解码 URL 编码文件名，改善 Markdown 默认标题。
- Markdown 阅读渲染：新增 Markdown + KaTeX MathML 渲染组件，支持 `$...$` 与 `$$...$$` 公式。

## 6. 关键文件与职责

| 文件 | 职责 |
|---|---|
| `frontend/app/(tabs)/questions.tsx` | 题库、文档库、目录浏览、上传、批量删除主逻辑 |
| `frontend/app/(tabs)/doc-reader.tsx` | 阅读原文、阅读进度、重命名、整理目录 |
| `frontend/src/components/UploadPreview.tsx` | 导入预览、目录选择、题目编辑 |
| `frontend/src/components/QuestionEditor.tsx` | 独立题目编辑与已有目录选择 |
| `frontend/src/components/MarkdownDocument.*` | Markdown/LaTeX 跨平台渲染 |
| `frontend/src/components/FilePicker.tsx` | Web/手机选择文件与文件名规范化 |
| `frontend/src/data/db.ts` | 原生 SQLite 初始化；`insertSampleData` 现已安全 no-op |
| `frontend/src/data/db.web.ts` | Web localStorage SQL 适配，新增目录更新支持 |
| `frontend/src/services/api.ts` | API 基址、token 恢复、上传与同步接口 |
| `backend/app/api/v1/upload.py` | 文件提取、AI 预览、确认导入、目录继承 |
| `backend/app/api/v1/sync.py` | push/pull、云端批量删除、目录更新 |

## 7. 新增/重要接口

所有以下接口都需要 Bearer token：

```text
POST /api/v1/upload/pdf
  multipart: file, generate_questions=true|false

POST /api/v1/upload/confirm
  body: preview_token, edits, category

POST /api/v1/sync/delete-documents
  body: document_ids[], delete_related_questions

POST /api/v1/sync/delete-questions
  body: question_ids[]

POST /api/v1/sync/update-document-category
  body: document_id, category
```

说明：题目分类字段 `cat` 目前同时承担“目录路径”角色。文档目录变化时，关联题目会继承同一路径；AI 返回的专题分类不会单独保留。

## 8. 当前未提交文件

截至本文件创建时，业务改动为：

```text
backend/app/api/v1/sync.py
backend/app/api/v1/upload.py
frontend/app/(tabs)/doc-reader.tsx
frontend/app/(tabs)/questions.tsx
frontend/package.json
frontend/package-lock.json
frontend/src/components/FilePicker.tsx
frontend/src/components/QuestionEditor.tsx
frontend/src/components/UploadPreview.tsx
frontend/src/data/db.web.ts
frontend/src/services/api.ts
frontend/src/components/MarkdownDocument.d.ts
frontend/src/components/MarkdownDocument.native.tsx
frontend/src/components/MarkdownDocument.web.tsx
frontend/src/components/MarkdownDocumentHtml.ts
```

不要提交以下本地文件：

```text
.tmp-goodtime/
backend/bagu.db
design/
```

建议在功能验证后提交：

```powershell
git add backend/app/api/v1/sync.py backend/app/api/v1/upload.py 'frontend/app/(tabs)/doc-reader.tsx' 'frontend/app/(tabs)/questions.tsx' frontend/package.json frontend/package-lock.json frontend/src/components/FilePicker.tsx frontend/src/components/QuestionEditor.tsx frontend/src/components/UploadPreview.tsx frontend/src/components/MarkdownDocument.d.ts frontend/src/components/MarkdownDocument.native.tsx frontend/src/components/MarkdownDocument.web.tsx frontend/src/components/MarkdownDocumentHtml.ts frontend/src/data/db.web.ts frontend/src/services/api.ts HANDOFF.md
git commit -m "feat: 完善目录管理与 Markdown 公式阅读"
```

## 9. 已验证与待验证

已执行并通过：

```powershell
cd frontend
npx tsc --noEmit

cd ..\backend
C:\Users\18253\AppData\Local\Programs\Python\Python313\python.exe -m compileall -q app
```

仍应手动验证：

1. Web 与手机端分别上传 `.md`，验证可读中文文件名。
2. 仅导入原文、生成题目两条流程均可选择导入目录。
3. 文档目录移动后，关联题目是否进入同一路径；同步后另一端是否一致。
4. 文档/题目批量删除后再同步，确认不会复活。
5. 使用含标题、表格、代码、`$x^2$`、`$$\\int_0^1 x^2 dx$$` 的 Markdown，在 Web 和手机端验证公式与内容高度。

Markdown 渲染注意：新依赖为 `react-native-webview`、`marked`、`katex`。手机端首次使用 WebView 后建议完全重启 Expo；`MarkdownDocument.native.tsx` 通过 WebView 动态回传内容高度。此功能目前已通过 TypeScript 检查，尚需真实手机和 Web 页面视觉回归。

## 10. 推荐下一步

优先级从高到低：

1. 完成第 9 节的手动回归，尤其是 Markdown 公式的真实 Web/手机显示。
2. 若无问题，按第 8 节命令提交本轮改动。
3. 优化目录操作：批量移动文档/题目、目录重命名、目录统计。
4. 将题目“专题分类”和“目录路径”拆成两个字段，避免目录移动覆盖 AI 专题分类。
5. 将手动同步优化为带删除 tombstone/版本号的增量同步，降低多设备冲突风险。

## 11. 给新对话的建议开场提示

```text
请先阅读 BaguApp/HANDOFF.md。继续在现有 dirty worktree 上开发，保留未提交改动，不要提交 backend/bagu.db、.tmp-goodtime、design。当前优先验证 Markdown + LaTeX 阅读渲染在 Web 和 Android 手机上的效果，确认后再提交“完善目录管理与 Markdown 公式阅读”。
```
