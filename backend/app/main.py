from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.api.v1 import auth, documents, home, questions, upload, progress, stats, sync, user_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables for a fresh development database. Production deployments
    # should run `alembic upgrade head` before starting the API.
    if settings.AUTO_CREATE_TABLES:
        await init_db()
    yield
    # Shutdown


app = FastAPI(
    title="八股记忆 API",
    description="面试八股文刷题 App 后端",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth.router)
app.include_router(home.router)
app.include_router(user_settings.router)
app.include_router(documents.router)
app.include_router(questions.router)
app.include_router(upload.router)
app.include_router(progress.router)
app.include_router(stats.router)
app.include_router(sync.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
