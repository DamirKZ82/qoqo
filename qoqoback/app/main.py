import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.middleware import REQUEST_ID_HEADER, RequestContextMiddleware
from app.api.router import api_router
from app.core.checks import cors_problem
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.bootstrap import ensure_owner
from app.db.migrate import run_migrations_if_enabled
from app.db.session import engine

settings = get_settings()

# Логи настраиваем до создания приложения, чтобы стартовые сообщения не потерялись.
configure_logging()

media_root = Path(settings.media_root)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    run_migrations_if_enabled()
    # После миграций: на новой базе таблицы появляются только что.
    ensure_owner()

    if (беда := cors_problem(settings)) is not None:
        logging.getLogger("app.startup").warning(беда)

    yield
    engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    debug=settings.debug,
    lifespan=lifespan,
)

# Порядок важен: CORS добавляется последним, поэтому отработает первым и
# проставит заголовки даже на ответ с ошибкой.
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Иначе браузер не увидит идентификатор запроса в ответе.
    expose_headers=[REQUEST_ID_HEADER],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


def mount_media(application: FastAPI) -> bool:
    """Подключает раздачу загруженных файлов с локального диска.

    Когда настроен бакет, файлы отдаёт он и каталог не нужен вовсе. А на
    serverless файловая система только для чтения: не смогли создать каталог —
    значит, раздавать нечего, и это не повод падать при импорте модуля.
    """

    if settings.s3_bucket:
        return False

    try:
        media_root.mkdir(parents=True, exist_ok=True)
    except OSError:
        return False

    application.mount("/media", StaticFiles(directory=media_root), name="media")
    return True


mount_media(app)
