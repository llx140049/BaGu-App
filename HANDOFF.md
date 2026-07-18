# BaguApp 项目交接文档

> 最后整理：2026-07-18（当前对话）。下方旧记录保留作背景；继续开发请以本节为准。

## 当前交接摘要（优先阅读）

### 工作区与提交

- 当前分支：`master`；最新提交：`d623665 feat: 完善学习计划与文档库体验`。
- 工作区是 **dirty worktree**，包含一整批已实现但尚未提交的功能。保留全部现有修改；不要执行 `git reset --hard`、`git checkout --`、批量删除或清理未跟踪目录。
- 本轮没有创建提交。若需要提交，请先按功能拆分并征得用户同意。
- 特别不要删除：`frontend/android/`、`backend/bagu.db`、`backend/venv-runtime/`、`.tmp-goodtime/`、`design/`。

### 一键启动与手机联调

在项目根目录执行：

```powershell
cd C:\Users\18253\Documents\BaguApp
.\start-dev.ps1
```

- 脚本会启动 FastAPI（`8001`）、Metro（`8081`），并在检测到 Android 设备时执行 `adb reverse tcp:8081 tcp:8081`、`adb reverse tcp:8001 tcp:8001`。
- 已连接过的设备序列号：`GILFK7Z95P4XMJYL`（以 `adb devices` 实际结果为准）。手机卡在启动页时，优先重新执行一键脚本，再彻底关闭并重开 App。
- `frontend/src/services/api.ts` 的原生端 API 地址当前为 `http://192.168.2.21:8001`。这是本机本次联网时的 LAN IP；网络变化后登录/导入失败，先通过 `ipconfig` 查当前 IPv4，再更新此处或改用 `EXPO_PUBLIC_API_URL` + `adb reverse`。
- 本机已验证 `http://192.168.2.21:8001/docs` 返回 `200`。

### 本轮重点改动（尚未提交）

#### 主题与页面

- 主题改为可持久化：`frontend/src/store/useThemeStore.ts` 读取/写入 SQLite 的 `app_settings.theme`；`frontend/app/_layout.tsx` 启动时 hydrate。
- 公共返回/菜单按钮已适配深色：`frontend/src/components/PrototypeUI.tsx`。
- 已覆盖首页、知识库、题库、题库层级、收藏/错题集合、文档库、文档层级、文档阅读、学习、统计、我的、学习计划及计划详情的大部分背景/文字/卡片。
- 文档库长按选择态：顶部批量栏会替代普通返回栏；目前不单独使用深灰底，而是融入页面背景。选中行在深色下使用 `#353740`。
- 题库/文档库/收藏错题的长按批量选择已处理深色选中态。若继续验收，应重点看：根目录、二级目录、批量删除弹窗和导出模式。

#### 文档与 Markdown

- `MarkdownDocument` 原生 WebView 已支持 `isDark`，并用深/浅 CSS 渲染标题、正文、引用、代码块、表格、链接和滚动条：
  - `frontend/src/components/MarkdownDocument.native.tsx`
  - `frontend/src/components/MarkdownDocument.web.tsx`
  - `frontend/src/components/MarkdownDocumentHtml.ts`
- `doc-reader.tsx` 已将主题传给正文和编辑预览；阅读页返回箭头、更多菜单也适配。
- 翻卡答案不再使用 WebView（会造成卡片内无法滚到底且底色不一致）。`frontend/app/(tabs)/study.tsx` 现在使用原生轻量 Markdown 渲染，支持标题、粗体、列表、引用和换行；复杂表格/LaTeX 暂未在翻卡答案中渲染，这是当前可继续优化点。

#### 登录、数据库与同步

- 近期“登录失败”的两类原因：
  1. 手机访问旧 LAN IP；已更新 API 默认地址为 `192.168.2.21`。
  2. SQLite 初始化竞争导致 `NativeDatabase.prepareAsync` / `NullPointerException`；已在 `frontend/src/data/db.ts` 增加 `dbPromise`，所有调用等待同一次数据库初始化和迁移完成。
- 设置页登录/退出会按账号隔离本地题库和文档库：切换账号前同步旧账号，切换后清空本地库，再拉取新账号数据；退出后本地库应为空。
- 若仍出现登录异常，先记录完整弹窗；再检查：后端 `8001`、手机与电脑网络、`adb reverse --list`、API 地址、以及 Metro 是否已重新加载最新 JS。

#### AI 标签与导入

- 导入时 AI 自动生成标签：问题标签限定 1–2 个，文档标签最多 3 个；会参考已有标签归纳上位概念，避免仅按文件名生成标签。
- Markdown Q/A 导入的题干/答案倒置修复采用保守规则。
- 相关后端文件：`backend/app/api/v1/upload.py`、`backend/app/services/deepseek.py`。

### 已知待验证/建议下一步

1. 用真机逐页切换深色模式，重点验收：文档库长按、题库导出/标签弹窗、文档阅读、学习计划、翻卡长答案。
2. 翻卡答案如必须支持完整 LaTeX、表格和图片，需要实现不依赖嵌套 WebView 的原生渲染方案，或重新设计卡片内 WebView 的高度与手势传递。
3. 网络切换后，优先将 API 地址改成当前 LAN IP，或完成基于开发环境的稳定 API 地址配置，避免再次硬编码失效。
4. 真机回归 PDF 转 Markdown（含图片）及原 PDF 阅读；旧记录中的 PDF 验收项仍然有效。

### 最小检查清单

```powershell
cd C:\Users\18253\Documents\BaguApp
git status --short
git diff --check

cd frontend
npx.cmd tsc --noEmit

cd ..\backend
.\venv-runtime\Scripts\python.exe -m py_compile app\api\v1\upload.py app\services\deepseek.py
```

更新日期：2026-07-18
当前分支：`master`
最近已提交版本：`2345095 fix: 同步已有题目的标签更新`

> **重要：工作区是 dirty worktree。** 其中包含多轮已实现但未提交的功能。继续开发必须保留现有改动；禁止使用 `git reset --hard`、`git checkout --`、批量删除，或清理 `frontend/android/`、`backend/bagu.db`、`.tmp-goodtime/`、`design/`。

## 1. 项目与技术栈

BaguApp 是 Android 优先的面试八股学习 App：用户导入 PDF/Markdown/文本，保存可阅读原文，使用 AI 生成题目，以标签、SM-2 复习和学习计划完成学习。

| 层 | 当前技术 |
| --- | --- |
| 前端 | Expo SDK 54、React Native 0.81、TypeScript、Expo Router |
| 本地数据 | Native：Expo SQLite；Web：`localStorage` 适配层 |
| 后端 | FastAPI、SQLAlchemy、Alembic；本地实际使用 SQLite |
| AI | DeepSeek `deepseek-chat` |
| PDF | `pdfplumber`（题目文本）、PyMuPDF4LLM（转带图片 Markdown） |
| Android 原生 PDF | `react-native-pdf`、`react-native-blob-util` |

设计基调：白/浅灰背景、深色文字、暖橙强调、文档绿色；全局 MiSans。不要把页面改成后台管理系统或 Material 默认风格。

## 2. 当前最重要的运行状态

### Android 开发包已可安装

- Android 真机开发包已构建并安装，包名为 `com.bagumemory.app`。
- 本次构建曾因 Java 8 失败；已改用真正的 JDK 17，之后构建成功。
- `frontend/android/` 是 Expo 原生预构建产物，虽被 Git 忽略但必须保留。
- 当前连接过的设备序列号为 `GILFK7Z95P4XMJYL`（设备型号可能会变化，以 `adb devices` 为准）。

### 手机启动慢的已知原因

开发包的 JS 由电脑上的 Metro 服务提供。USB 重连、重启 adb 或 Metro 后，`adb reverse` 会丢失，手机会卡在启动/加载页。

启动前端并恢复转发：

```powershell
cd C:\Users\18253\Documents\BaguApp\frontend
npx expo start --offline

# 可在任意目录执行；手机必须显示为 device
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8001 tcp:8001
adb reverse --list
```

然后彻底关闭并重新打开手机上的 BaguApp。首次重新打包通常需要 10～30 秒；若 `adb reverse --list` 为空，优先重新执行上面两行。

`EXPO_PUBLIC_API_URL` 已在本机未提交的 `frontend/.env.local` 设置为 `http://127.0.0.1:8001`，因此 Android 必须有 `8001` 的转发。

### 后端运行环境

- 原 `backend/venv` 已损坏/不可用；当前使用 `backend/venv-runtime`。
- 不要把该虚拟环境提交到 Git。

```powershell
cd C:\Users\18253\Documents\BaguApp\backend
.\venv-runtime\Scripts\python.exe -m alembic upgrade head
.\venv-runtime\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

健康检查：`http://127.0.0.1:8001/api/health`。

## 3. 已完成功能

### 导入、文档和学习

- 支持导入 `.pdf`、`.md`、`.markdown`、`.txt`、`.text`，最大 100MB。
- 导入以预览流程完成：仅导入原文 / 导入并生成题目；可预览、编辑分类后确认保存。
- 文档库支持文件夹、搜索、长按多选、批量删除及可选删除关联题目。
- 文档阅读页支持 Markdown/LaTeX、正文编辑和预览切换。
- 移除了“学习方式 / 智能安排”以及文档阅读页“分享”“导出”入口。
- 学习计划具备重置/同步目标的实现；题目支持多标签、收藏、错题与 SM-2 复习。

### 原始 PDF 阅读

- PDF 确认导入后，会保存原始文件键 `documents.original_file_key`。
- 文档页“阅读原文件”打开 App 内 PDF 阅读器：缩放、双击缩放、页码；并有“用其他应用打开”兜底。
- 原始 PDF 获取接口：`GET /api/v1/documents/{document_id}/original-file`，需要 JWT。
- 旧文档没有 `original_file_key`，需重新导入才能使用原文件阅读。
- 关键文件：
  - `frontend/app/pdf-reader.tsx`
  - `frontend/src/components/PdfDocument.native.tsx`
  - `frontend/app/(tabs)/doc-reader.tsx`
  - `backend/app/api/v1/documents.py`
  - `backend/app/api/v1/upload.py`
  - `backend/migrations/versions/20260717_03_original_file.py`

### PDF 转为 Markdown（正在回归验证）

用户要求：导入 PDF 后自动转为**保留原图**的 Markdown；不再提供旧的“直接解析文字版本”；同时保留“浏览原 PDF”。当前实现：

- `backend/app/services/pdf_service.py` 使用 `pymupdf4llm.to_markdown(..., write_images=True)` 生成 Markdown 及图片。
- 图片保存至 `backend/uploads/{file_id}-assets/`，Markdown 使用 `{{API_BASE}}/api/v1/document-assets/...` 引用。
- 后端提供图片资产接口：`GET /api/v1/documents/document-assets/{asset_dir}/{filename}`。
- 前端 `MarkdownDocument.native.tsx` 会替换 `{{API_BASE}}`；并针对旧数据中出现过的“双重 API URL”做兼容修正。
- PDF 原始文件页已经在真机成功显示过。

**尚未真正验收：** 用户此前仍反馈过“图片未加载”和“字体不统一”。后续必须在真机重新导入一份含图片的 PDF，观察 Network/后端日志，确认图片 200、正文和代码块的渲染。

### Markdown 字体与样式

- Native Markdown 使用 WebView，加载 `assets/fonts/MiSans-Regular.otf`；已加入 `expo-asset`。
- `MarkdownDocumentHtml.ts` 强制 WebView 正文、代码与所有子节点使用 MiSans，并调整代码块/文字块配色。
- 此改动已通过 TypeScript 检查，但**尚未获得用户的最终真机视觉确认**。

### AI 题目答案质量（最新改动）

`backend/app/services/deepseek.py` 的 `SYSTEM_PROMPT` 已强化，生成的 `a` 字段要求为 Markdown，并使用：

1. **结论**
2. **核心原理**
3. **关键要点**
4. **易错点与追问**（如适用）
5. **示例**（原文有明确示例时才生成）

同时要求模型不编造原文外信息，信息不足时写“原文未说明”。该文件已通过 `py_compile`。

## 4. 导入类型现状

| 类型 | 支持情况 | 处理方式 |
| --- | --- | --- |
| PDF | 支持 | PyMuPDF4LLM 转带原图 Markdown；另保存原文件 |
| Markdown (`.md`/`.markdown`) | 支持 | UTF-8 原样读取 |
| 文本 (`.txt`/`.text`) | 支持 | UTF-8 原样读取 |
| Word (`.doc`/`.docx`) | **不支持** | 会提示文件格式不支持 |
| PPT/Excel/图片 | **不支持** | 会提示文件格式不支持 |

前端文件选择器、Android MIME 限制及后端格式校验目前一致。Markdown 和 UTF-8 文本解析已做直接验证。旧式 GBK 编码文本可能乱码；尚未做编码探测。

## 5. 数据库、迁移与关键接口

### 后端

- `backend/migrations/versions/20260717_03_original_file.py` 为 `documents` 添加 `original_file_key`。
- 本地数据库为未跟踪 `backend/bagu.db`；此前缺列问题已修复。不可提交或删除。
- 上传入口仍名为 `POST /api/v1/upload/pdf`，但实际接收 PDF、Markdown、TXT。后续重命名会涉及前后端，暂不做无关重构。
- PDF 图片资产路由必须在 `/api/v1/documents/{document_id}` 这类参数路由之前，当前已处理。

### 前端本地库

- Native/Web 数据库均已增加 `documents.has_original_file`；修改字段时必须同步 `frontend/src/data/db.ts` 和 `frontend/src/data/db.web.ts`。

## 6. 已知问题与建议优先级

1. **真机回归 PDF 转 Markdown**：重新导入有图片的 PDF；确认图片加载、长文高度、MiSans 字体、代码块对比度和原 PDF 阅读。
2. 若图片依旧失败，先检查：后端是否运行、`adb reverse tcp:8001 tcp:8001`、接口 `/api/v1/documents/document-assets/...` 是否返回 200，以及文档内容内的图片 URL 是否被重复拼接。
3. **完善 AI 长文档处理**：当前仍将最多 400,000 字符一次性发送 DeepSeek；下一步可按标题/页分段生成、合并并去重，避免后半段遗漏。用户只要求并已实现了“答案结构化”第一项，未开始分段去重。
4. 需要支持常见办公文档时，优先补 `.docx`，保持最小依赖与导入流程一致。
5. 重新构建原生包仅在原生依赖或 Android 配置改变后需要；普通 TS/样式改动使用 Metro 热更新即可。

## 7. 常用检查命令

```powershell
# 工作区（不要清理改动）
cd C:\Users\18253\Documents\BaguApp
git status --short
git diff --check

# 前端类型检查
cd C:\Users\18253\Documents\BaguApp\frontend
npx.cmd tsc --noEmit

# 后端语法检查
cd C:\Users\18253\Documents\BaguApp\backend
.\venv-runtime\Scripts\python.exe -m py_compile app\services\deepseek.py app\services\pdf_service.py

# 设备与转发状态
adb devices
adb reverse --list
```

## 8. 当前工作区概况

已知修改涉及文档导入、文档库、原始 PDF、PDF Markdown、DeepSeek 提示词、学习计划、标签、前端样式与依赖；还有未跟踪的迁移、`pdf-reader.tsx`、PDF 组件、导入流程组件、日志、SQLite 和虚拟环境。

提交前必须按功能拆分；除非用户明确授权，**不要自行提交、推送或删除任何文件**。

## 9. 新对话可直接使用的提示词

```text
请先完整阅读 C:\Users\18253\Documents\BaguApp\HANDOFF.md，并执行 git status --short。

这是 dirty worktree：保留所有未提交改动。不要执行 reset、checkout、清理或删除；尤其不要删除 frontend/android、backend/bagu.db、backend/venv-runtime、.tmp-goodtime、design。

当前优先任务：在 Android 真机回归导入一份含图片的 PDF，验证 PDF 自动转带原图 Markdown、图片接口、MiSans 正文字体/代码块样式与“浏览原 PDF”。

运行后端：cd backend; .\venv-runtime\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001。
运行前端：cd frontend; npx expo start --offline；然后在任意目录执行 adb reverse tcp:8081 tcp:8081 和 adb reverse tcp:8001 tcp:8001。

继续开发前先理解现有实现，只做最小范围修改。修改后至少运行 cd frontend; npx.cmd tsc --noEmit。
```
