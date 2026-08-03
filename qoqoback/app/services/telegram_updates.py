import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ROLE_TITLES, User
from app.services import telegram

logger = logging.getLogger(__name__)

HELP_TEXT = (
    "Бот уведомлений QoQo.\n\n"
    "<b>/start код</b> — привязать учётную запись. Ссылку с кодом выдаёт "
    "панель пользователя в системе.\n"
    "<b>/status</b> — показать, к кому привязан этот чат.\n"
    "<b>/stop</b> — отвязать учётную запись."
)


def _chat_user(db: Session, chat_id: int) -> User | None:
    return (
        db.execute(select(User).where(User.telegram_chat_id == chat_id))
        .unique()
        .scalar_one_or_none()
    )


def handle_update(db: Session, update: dict[str, Any]) -> None:
    """Разбирает одно обновление от Telegram.

    Обрабатываются только текстовые команды в личных чатах: бот ничего не
    читает и не хранит из обычной переписки.
    """

    message = update.get("message") or update.get("edited_message")
    if not isinstance(message, dict):
        return

    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = (message.get("text") or "").strip()
    if chat_id is None or not text.startswith("/"):
        return

    sender = message.get("from") or {}
    username = sender.get("username")
    command, _, argument = text.partition(" ")
    command = command.split("@")[0].lower()
    argument = argument.strip()

    if command == "/start":
        _handle_start(db, chat_id, username, argument)
    elif command == "/status":
        _handle_status(db, chat_id)
    elif command in ("/stop", "/unlink"):
        _handle_stop(db, chat_id)
    else:
        telegram.send_message(chat_id, HELP_TEXT)


def _handle_start(db: Session, chat_id: int, username: str | None, code: str) -> None:
    if not code:
        telegram.send_message(
            chat_id,
            "Чтобы привязать учётную запись, откройте ссылку из панели пользователя "
            "в системе QoQo.\n\n" + HELP_TEXT,
        )
        return

    user = telegram.redeem_link_code(db, code, chat_id, username)
    if user is None:
        telegram.send_message(
            chat_id,
            "Ссылка недействительна или уже использована. Запросите новую в панели пользователя.",
        )
        logger.info("Неудачная попытка привязки чата %s", chat_id)
        return

    role = ROLE_TITLES.get(user.role, user.role.value)
    telegram.send_message(
        chat_id,
        f"Готово. Чат привязан к учётной записи <b>{telegram.html(user.full_name)}</b> "
        f"({telegram.html(role)}).\n\nСюда будут приходить уведомления по работе.",
    )
    logger.info("Чат привязан к сотруднику %s", user.email)


def _handle_status(db: Session, chat_id: int) -> None:
    user = _chat_user(db, chat_id)
    if user is None:
        telegram.send_message(chat_id, "Этот чат ни к кому не привязан.\n\n" + HELP_TEXT)
        return

    role = ROLE_TITLES.get(user.role, user.role.value)
    telegram.send_message(
        chat_id,
        f"Чат привязан к <b>{telegram.html(user.full_name)}</b> ({telegram.html(role)}).",
    )


def _handle_stop(db: Session, chat_id: int) -> None:
    user = _chat_user(db, chat_id)
    if user is None:
        telegram.send_message(chat_id, "Этот чат ни к кому не привязан.")
        return

    telegram.unlink(db, user)
    telegram.send_message(
        chat_id,
        "Учётная запись отвязана. Уведомления приходить не будут. "
        "Чтобы вернуть — привяжите заново из панели пользователя.",
    )
