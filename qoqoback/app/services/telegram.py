import logging
import secrets
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import User
from app.models.telegram import TelegramLinkCode

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot"
TIMEOUT = 15.0

# Кэш имени бота: оно не меняется, а спрашивать его при каждой привязке незачем.
_bot_username: str | None = None


def is_configured() -> bool:
    return bool(get_settings().tg_token)


def call(method: str, payload: dict[str, Any] | None = None, *, timeout: float = TIMEOUT) -> Any:
    """Вызывает метод Telegram Bot API.

    Возвращает содержимое result или None при любой неудаче: уведомление не
    должно ронять бизнес-операцию, ради которой оно отправляется.
    """

    settings = get_settings()
    if not settings.tg_token:
        return None

    try:
        response = httpx.post(
            f"{API_BASE}{settings.tg_token}/{method}",
            json=payload or {},
            timeout=timeout,
        )
        data = response.json()
    except (httpx.HTTPError, ValueError):
        # Токен в сообщение не попадает: он есть в URL, поэтому логируем без него.
        logger.exception("Ошибка обращения к Telegram, метод %s", method)
        return None

    if not data.get("ok"):
        logger.error("Telegram отклонил %s: %s", method, data.get("description"))
        return None

    return data.get("result")


def get_bot_username() -> str | None:
    """Имя бота для ссылки t.me/<имя>."""

    global _bot_username

    settings = get_settings()
    if settings.tg_bot_username:
        return settings.tg_bot_username.lstrip("@")
    if _bot_username:
        return _bot_username

    result = call("getMe")
    if result:
        _bot_username = result.get("username")
    return _bot_username


def send_message(chat_id: int, text: str) -> bool:
    """Отправляет сообщение в чат. Разметка — HTML."""

    result = call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
    )
    return result is not None


def notify_user(user: User | None, text: str) -> bool:
    """Пишет сотруднику, если он привязал Telegram.

    Точка расширения для будущих рассылок: заявки на исполнение, напоминания
    и прочее — всё отправляется через неё.
    """

    if user is None or user.telegram_chat_id is None:
        return False
    return send_message(user.telegram_chat_id, text)


def notify_users(users: list[User], text: str) -> int:
    """Рассылка нескольким сотрудникам. Возвращает число доставленных."""

    return sum(1 for user in users if notify_user(user, text))


def html(value: object) -> str:
    """Экранирует текст для HTML-разметки Telegram."""

    return escape(str(value), quote=False)


# --- Привязка учётной записи ---------------------------------------------


def create_link_code(db: Session, user: User) -> TelegramLinkCode:
    """Выдаёт одноразовый код привязки, гася прошлые неиспользованные."""

    now = datetime.now(UTC)
    stale = db.execute(
        select(TelegramLinkCode)
        .where(TelegramLinkCode.user_id == user.id)
        .where(TelegramLinkCode.used_at.is_(None))
    ).scalars()
    for item in stale:
        item.expires_at = now

    code = secrets.token_urlsafe(12).replace("-", "").replace("_", "")[:16]
    link_code = TelegramLinkCode(
        code=code,
        user_id=user.id,
        expires_at=now + timedelta(minutes=get_settings().tg_link_code_ttl_minutes),
    )
    db.add(link_code)
    db.flush()
    return link_code


def redeem_link_code(db: Session, code: str, chat_id: int, username: str | None) -> User | None:
    """Связывает чат с сотрудником по коду. Возвращает сотрудника или None."""

    link_code = (
        db.execute(select(TelegramLinkCode).where(TelegramLinkCode.code == code))
        .unique()
        .scalar_one_or_none()
    )

    if link_code is None or link_code.used_at is not None:
        return None

    expires_at = link_code.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        return None

    user = link_code.user

    # Один чат — один сотрудник: снимаем привязку с прежнего владельца чата,
    # иначе уведомления уходили бы не тому.
    previous = (
        db.execute(select(User).where(User.telegram_chat_id == chat_id).where(User.id != user.id))
        .unique()
        .scalars()
        .all()
    )
    for other in previous:
        other.telegram_chat_id = None
        other.telegram_username = None
        other.telegram_linked_at = None

    now = datetime.now(UTC)
    user.telegram_chat_id = chat_id
    user.telegram_username = username
    user.telegram_linked_at = now
    link_code.used_at = now

    db.commit()
    return user


def unlink(db: Session, user: User) -> None:
    user.telegram_chat_id = None
    user.telegram_username = None
    user.telegram_linked_at = None
    db.commit()


def build_deep_link(code: str) -> str | None:
    username = get_bot_username()
    return f"https://t.me/{username}?start={code}" if username else None
