# 八股记忆

面试八股文刷题 App — PDF → AI 自动生成题库，间隔重复（SM-2）科学复习。

## 技术栈

| 层面 | 选型 |
|------|------|
| 前端 | Expo SDK 57 + React Native 0.86 + TypeScript |
| 路由 | expo-router (文件路由) |
| 状态 | Zustand |
| 本地存储 | expo-sqlite |
| 后端 | Python FastAPI |
| 云服务 | Supabase (PG + Auth + Storage) |
| AI | DeepSeek V4 |

## 快速启动

### 后端

```bash
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8001
```

API 文档：http://localhost:8001/docs

### 前端

```bash
cd frontend
npm start
```

Web 预览：http://localhost:8081

## 项目结构

```
八股app/
├── backend/
│   ├── app/
│   │   ├── api/v1/       # RESTful 路由
│   │   ├── core/         # 配置 / 数据库 / 安全 / Supabase
│   │   ├── models/       # SQLAlchemy ORM 模型
│   │   ├── schemas/      # Pydantic 请求/响应模型
│   │   ├── services/     # SM-2 / PDF / DeepSeek
│   │   └── main.py       # FastAPI 入口
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/              # expo-router 文件路由
│   │   └── (tabs)/       # 5 个 Tab 页面
│   ├── src/
│   │   ├── components/   # 通用组件
│   │   ├── data/         # SQLite + 示例数据
│   │   ├── services/     # API 客户端
│   │   ├── store/        # Zustand 状态
│   │   └── tokens/       # 设计 Token
│   └── package.json
└── README.md
```

## MVP 路线

- **P0** ✅ 翻卡 + SM-2 + SQLite + 首页
- **P1** 🔄 PDF 上传 + DeepSeek + Supabase + 云端同步
- **P2** ⏳ 选择题/听写 + 错题本 + 搜索 + 统计 + 设置
- **P3** ⏳ 通知 + 打卡 + 导出 + 批量导入 + 分享
