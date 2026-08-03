import os
from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

settings = get_settings()

# Синхронный движок: на Windows асинхронный psycopg несовместим с ProactorEventLoop,
# который asyncio использует по умолчанию. FastAPI выполняет sync-зависимости в пуле потоков.
# echo включается отдельной настройкой, а не через debug: при echo=True
# SQLAlchemy сам поднимает уровень своего логгера и забивает файл журнала
# текстами запросов, из-за чего ошибки в нём не найти.
engine_options: dict[str, Any] = {"echo": settings.db_echo, "pool_pre_ping": True}

# На serverless процесс живёт от вызова к вызову: переиспользовать пул некому,
# а лимит подключений базы он выедает. Vercel сам выставляет VERCEL=1, но
# переключатель есть и явный — на случай другой платформы.
if settings.db_null_pool or os.getenv("VERCEL") == "1":
    engine_options["poolclass"] = NullPool

engine = create_engine(settings.database_url, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
