"""Приём сообщений бота опросом Telegram.

Запуск:  .venv/Scripts/python.exe -m app.scripts.telegram_bot

Нужен для разработки и для контура без публичного адреса: вебхук Telegram
требует доступного извне HTTPS, а опрос работает откуда угодно. В боевом
контуре вместо этого процесса включается вебхук
POST /api/v1/telegram/webhook/<секрет>.
"""

import logging
import time

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.services import telegram
from app.services.telegram_updates import handle_update

logger = logging.getLogger("app.telegram")

# Долгий опрос: соединение висит до появления сообщения или до таймаута.
LONG_POLL_SECONDS = 25
RETRY_DELAY_SECONDS = 5


def main() -> int:
    configure_logging()
    settings = get_settings()

    if not settings.tg_token:
        logger.error("В конфигурации нет TG_TOKEN — бот не запущен")
        return 1

    username = telegram.get_bot_username()
    if not username:
        logger.error("Telegram не отвечает: проверьте TG_TOKEN и доступ в сеть")
        return 1

    logger.info("Бот @%s запущен, опрашиваю обновления", username)

    offset: int | None = None
    while True:
        updates = telegram.call(
            "getUpdates",
            {
                "timeout": LONG_POLL_SECONDS,
                "offset": offset,
                # Читаем только сообщения: остальные типы обновлений не нужны.
                "allowed_updates": ["message"],
            },
            # Ждём дольше самого опроса, иначе клиент оборвёт соединение раньше.
            timeout=LONG_POLL_SECONDS + 10,
        )

        if updates is None:
            time.sleep(RETRY_DELAY_SECONDS)
            continue

        for update in updates:
            # Сдвигаем указатель до обработки: сообщение, на котором бот
            # падает, иначе возвращалось бы бесконечно.
            offset = update["update_id"] + 1
            try:
                with SessionLocal() as db:
                    handle_update(db, update)
            except Exception:
                logger.exception("Ошибка обработки обновления %s", update.get("update_id"))


if __name__ == "__main__":
    raise SystemExit(main())
