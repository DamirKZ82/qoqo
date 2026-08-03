import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin
from app.models.user import User


class TelegramLinkCode(UUIDMixin, TimestampMixin, Base):
    """Одноразовый код привязки учётной записи к чату в Telegram.

    Код короткий и живёт минуты: он передаётся через ссылку и попадает в
    историю чата, поэтому долгоживущим быть не должен.
    """

    __tablename__ = "telegram_link_codes"

    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(lazy="joined")
