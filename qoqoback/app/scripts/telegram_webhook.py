"""Управление вебхуком телеграм-бота.

    python -m app.scripts.telegram_webhook status
    python -m app.scripts.telegram_webhook set https://qoqo.kz
    python -m app.scripts.telegram_webhook delete

Вебхук — боевой способ приёма сообщений: Telegram сам стучится в приложение,
отдельный процесс не нужен. Опрос (app.scripts.telegram_bot) остаётся для
разработки и для контура без публичного HTTPS-адреса.

Одновременно работает что-то одно: пока стоит вебхук, getUpdates возвращает
ошибку, поэтому перед запуском опроса вебхук надо снять командой delete.
"""

import argparse
import logging
import sys

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.services import telegram

logger = logging.getLogger("app.telegram")

WEBHOOK_PATH = "/api/v1/telegram/webhook"


def _require_token() -> bool:
    if not get_settings().tg_token:
        logger.error("В конфигурации нет TG_TOKEN")
        return False
    return True


def _show_status() -> int:
    if not _require_token():
        return 1

    info = telegram.webhook_info()
    if info is None:
        logger.error("Telegram не отвечает: проверьте TG_TOKEN и доступ в сеть")
        return 1

    url = info.get("url") or ""
    if not url:
        print("Вебхук не установлен — сообщения принимает опрос.")
    else:
        print(f"Вебхук: {url}")
        # Установлен ли секрет, Telegram не сообщает — проверить можно только
        # тем, что вызовы доходят.
        print(f"Необработанных обновлений: {info.get('pending_update_count', 0)}")
        if info.get("last_error_message"):
            # Telegram запоминает последнюю неудачу доставки — по ней сразу
            # видно и просроченный сертификат, и закрытый порт.
            print(f"Последняя ошибка: {info['last_error_message']}")

    if not get_settings().tg_webhook_secret:
        print("\nTG_WEBHOOK_SECRET не задан — приложение отклонит любой вызов вебхука.")
    return 0


def _set_webhook(base_url: str) -> int:
    if not _require_token():
        return 1

    secret = get_settings().tg_webhook_secret
    if not secret:
        # Секрет не придумываем на лету: он должен пережить перезапуск, иначе
        # после него Telegram будет слать старый секрет, а мы ждать новый.
        print("В конфигурации нет TG_WEBHOOK_SECRET. Впишите в .env строку:\n")
        print(f"TG_WEBHOOK_SECRET={telegram.generate_webhook_secret()}\n")
        print("и повторите команду.")
        return 1

    if not base_url.startswith("https://"):
        # Требование Telegram, а не наша придирчивость: вебхук только по HTTPS.
        logger.error("Адрес должен начинаться с https:// — Telegram шлёт вебхук только так")
        return 1

    url = base_url.rstrip("/") + WEBHOOK_PATH
    if not telegram.set_webhook(url, secret):
        logger.error("Telegram не принял адрес %s", url)
        return 1

    print(f"Вебхук установлен: {url}")
    print("Опрос (app.scripts.telegram_bot) теперь запускать не нужно.")
    return 0


def _delete_webhook() -> int:
    if not _require_token():
        return 1
    if not telegram.delete_webhook():
        logger.error("Не удалось снять вебхук")
        return 1
    print("Вебхук снят — можно запускать опрос.")
    return 0


def main(argv: list[str] | None = None) -> int:
    configure_logging()

    parser = argparse.ArgumentParser(description="Управление вебхуком телеграм-бота")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="показать состояние вебхука")
    set_parser = sub.add_parser("set", help="установить вебхук")
    set_parser.add_argument("base_url", help="адрес приложения, например https://qoqo.kz")
    sub.add_parser("delete", help="снять вебхук")

    args = parser.parse_args(argv)

    if args.command == "status":
        return _show_status()
    if args.command == "set":
        return _set_webhook(args.base_url)
    return _delete_webhook()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
