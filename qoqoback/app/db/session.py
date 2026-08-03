from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# Синхронный движок: на Windows асинхронный psycopg несовместим с ProactorEventLoop,
# который asyncio использует по умолчанию. FastAPI выполняет sync-зависимости в пуле потоков.
engine = create_engine(settings.database_url, echo=settings.debug, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
