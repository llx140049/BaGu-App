# BaguApp：Render + Supabase 部署

## 当前状态

仓库已经具备：

- Render Blueprint：`render.yaml`
- PostgreSQL/Alembic 启动迁移
- 普通 PostgreSQL URL 到 SQLAlchemy asyncpg URL 的自动转换
- Supabase Storage 与本地文件存储双后端
- PostgreSQL 账号与同步快照表
- 本地旧账号首次登录迁移
- 健康检查：`GET /api/health`

同步数据已存入 PostgreSQL 的 `sync_snapshots` 表。旧本地 JSON 只会在某个用户
第一次读取、且还没有数据库快照时导入一次；之后不会再写回本地文件。

## 1. 创建 Supabase 项目

在 Supabase Dashboard 创建项目，区域尽量与 Render 服务相同或相近。

记录以下值：

- Project URL → `SUPABASE_URL`
- Service role key → `SUPABASE_SERVICE_KEY`
- PostgreSQL connection string → `DATABASE_URL`

`SUPABASE_SERVICE_KEY` 只能配置在 Render 后端，禁止写入前端、Git 或 App。

## 2. 创建 Storage Bucket

在 Supabase Storage 创建：

```text
bagu-documents
```

配置：

- Private bucket
- 最大文件：100MB
- 允许类型至少包括：
  - `application/pdf`
  - `image/png`

当前文件由可信 FastAPI 后端使用 service role key 代理读写，不需要为客户端开放
Storage RLS 写权限。

## 3. 数据库连接

优先选择 Supabase Shared Pooler 的 session mode 连接串，适合 Render 上的常驻
FastAPI 服务。

本项目接受以下开头并自动转换为 asyncpg：

```text
postgres://
postgresql://
postgresql+asyncpg://
```

不要把数据库密码提交进 `.env.example`。

## 4. 创建 Render Blueprint

将代码推送到 GitHub 后，在 Render 中选择 New → Blueprint，并选中仓库根目录的
`render.yaml`。

需要填写的 Secret：

```text
DATABASE_URL
DEEPSEEK_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
CORS_ORIGINS
```

Render 自动生成：

```text
SECRET_KEY
```

固定配置：

```text
STORAGE_BACKEND=supabase
SUPABASE_STORAGE_BUCKET=bagu-documents
AUTO_CREATE_TABLES=false
```

每次部署会在启动新版本前运行：

```text
python -m alembic upgrade head
```

## 5. 部署后验证

假设 Render 地址为：

```text
https://bagu-api.onrender.com
```

检查：

```text
GET https://bagu-api.onrender.com/api/health
GET https://bagu-api.onrender.com/docs
```

随后按顺序验收：

1. 注册新账号；
2. 登录；
3. 导入一个 Markdown 文件；
4. 导入一个含图片 PDF；
5. 确认 Supabase Storage 出现原 PDF 和图片；
6. 确认 App 文档页图片可显示；
7. 确认“阅读原文件”可打开；
8. 重启 Render 服务后重新登录和读取文件。

## 6. Android API 地址

部署验证通过后，将前端生产环境配置为：

```text
EXPO_PUBLIC_API_URL=https://bagu-api.onrender.com
```

本地开发继续使用：

```text
EXPO_PUBLIC_API_URL=http://127.0.0.1:8001
```

生产包不能继续使用硬编码局域网 IP。
