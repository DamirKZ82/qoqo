from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.router import api_router
from app.core.config import get_settings
from app.db.session import engine

settings = get_settings()

media_root = Path(settings.media_root)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    media_root.mkdir(parents=True, exist_ok=True)
    yield
    engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)

# Загруженные файлы (логотип из настроек системы).
media_root.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_root), name="media")
