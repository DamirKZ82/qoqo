import uuid
from enum import StrEnum
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDMixin


class LogSource(StrEnum):
    SERVER = "server"
    CLIENT = "client"


class LogLevel(StrEnum):
    ERROR = "error"
    WARNING = "warning"


SOURCE_TITLES: dict[LogSource, str] = {
    LogSource.SERVER: "Сервер",
    LogSource.CLIENT: "Браузер",
}


class ErrorLog(UUIDMixin, Base):
    """Запись об ошибке.

    Дублирует то, что уходит в файл, но доступна из интерфейса: администратору
    не нужен доступ к серверу, чтобы понять, на что жалуется сотрудник.
    """

    __tablename__ = "error_logs"

    created_at: Mapped[Any] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    source: Mapped[LogSource] = mapped_column(
        Enum(
            LogSource, native_enum=False, length=10, values_callable=lambda e: [i.value for i in e]
        ),
        nullable=False,
        index=True,
    )
    level: Mapped[LogLevel] = mapped_column(
        Enum(
            LogLevel, native_enum=False, length=10, values_callable=lambda e: [i.value for i in e]
        ),
        default=LogLevel.ERROR,
        nullable=False,
        index=True,
    )

    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    # Трассировка стека — она бывает длинной, поэтому TEXT.
    detail: Mapped[str | None] = mapped_column(Text)

    request_id: Mapped[str | None] = mapped_column(String(36), index=True)
    method: Mapped[str | None] = mapped_column(String(10))
    path: Mapped[str | None] = mapped_column(String(500), index=True)
    status_code: Mapped[int | None] = mapped_column(Integer)

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    user_agent: Mapped[str | None] = mapped_column(String(500))
    # Произвольные подробности с клиента: адрес страницы, версия сборки и т.п.
    context: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
