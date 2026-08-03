from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.services import telegram

router = APIRouter(prefix="/telegram", tags=["Telegram"])


class TelegramStatus(BaseModel):
    """Состояние привязки для панели пользователя."""

    # Настроен ли бот вообще: без токена привязку показывать незачем.
    configured: bool
    linked: bool
    username: str | None = None
    linked_at: datetime | None = None
    bot_username: str | None = None


class LinkResponse(BaseModel):
    code: str
    deep_link: str | None
    expires_at: datetime
    bot_username: str | None


def _status(user: Any) -> TelegramStatus:
    configured = telegram.is_configured()
    return TelegramStatus(
        configured=configured,
        linked=user.telegram_chat_id is not None,
        username=user.telegram_username,
        linked_at=user.telegram_linked_at,
        bot_username=telegram.get_bot_username() if configured else None,
    )


@router.get("/status", response_model=TelegramStatus)
def read_status(user: CurrentUser) -> TelegramStatus:
    return _status(user)


@router.post("/link", response_model=LinkResponse)
def create_link(db: DbSession, user: CurrentUser) -> LinkResponse:
    """Выдаёт одноразовый код и ссылку для привязки."""

    if not telegram.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Телеграм-бот не настроен: в конфигурации нет TG_TOKEN",
        )

    link_code = telegram.create_link_code(db, user)
    db.commit()

    return LinkResponse(
        code=link_code.code,
        deep_link=telegram.build_deep_link(link_code.code),
        expires_at=link_code.expires_at,
        bot_username=telegram.get_bot_username(),
    )


@router.delete("/link", response_model=TelegramStatus)
def remove_link(db: DbSession, user: CurrentUser) -> TelegramStatus:
    if user.telegram_chat_id is not None:
        telegram.send_message(
            user.telegram_chat_id,
            "Учётная запись QoQo отвязана от этого чата. Уведомления приходить не будут.",
        )
    telegram.unlink(db, user)
    return _status(user)


@router.post("/webhook/{secret}", include_in_schema=False)
def webhook(secret: str, update: dict[str, Any], db: DbSession) -> dict[str, str]:
    """Приём обновлений от Telegram в боевом контуре.

    Секрет в адресе — от посторонних вызовов: адрес знает только Telegram,
    которому мы его сообщили при setWebhook. В разработке вместо вебхука
    работает опрос: python -m app.scripts.telegram_bot
    """

    settings = get_settings()
    if not settings.tg_token or secret != settings.tg_token.split(":")[-1]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Не найдено")

    from app.services.telegram_updates import handle_update

    handle_update(db, update)
    return {"status": "ok"}
