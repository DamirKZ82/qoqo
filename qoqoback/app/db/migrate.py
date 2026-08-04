"""Накат миграций при старте приложения.

Нужен там, где приложение живёт постоянным процессом: свой сервер, systemd,
pm2, контейнер. Один раз при выкатке схема доводится до нужной версии, и
человеку не надо помнить об отдельной команде.

Несколько рабочих процессов стартуют одновременно, поэтому схему меняем под
блокировкой уровня базы: первый накатывает, остальные ждут и видят, что делать
уже нечего. Блокировка снимается сама при закрытии соединения — даже если
процесс убьют посреди работы, она не останется висеть.

На serverless это выключено намеренно, см. RUN_MIGRATIONS_ON_START в конфиге.
"""

import logging
import os
from pathlib import Path

from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.core.config import get_settings
from app.db.session import engine

logger = logging.getLogger(__name__)

# Произвольное число: важно лишь, чтобы его использовали все процессы этого
# приложения и никто больше.
LOCK_ID = 74157393

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def on_serverless() -> bool:
    """Vercel выставляет эту переменную сам."""

    return os.getenv("VERCEL") == "1"


def run_migrations_if_enabled() -> None:
    """Доводит схему до последней ревизии, если это разрешено настройкой."""

    settings = get_settings()

    if not settings.run_migrations_on_start:
        return

    if on_serverless():
        # Здесь процесс поднимается на каждый запрос, а не на выкатку: накат
        # схемы превратился бы в проверку при каждом холодном старте и мог бы
        # оборваться на пределе времени функции.
        logger.warning(
            "RUN_MIGRATIONS_ON_START включён, но на serverless миграции не выполняются. "
            "Накатывайте их отдельным шагом — из CI или с машины."
        )
        return

    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(ALEMBIC_INI.parent / "alembic"))

    with engine.connect() as connection:
        connection.execute(text("SELECT pg_advisory_lock(:key)"), {"key": LOCK_ID})
        connection.commit()
        try:
            logger.info("Проверяю схему базы")
            command.upgrade(config, "head")
            logger.info("Схема базы в актуальном состоянии")
        finally:
            connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": LOCK_ID})
            connection.commit()
