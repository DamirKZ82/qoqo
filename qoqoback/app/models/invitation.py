import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin
from app.models.user import User


class InvitationPurpose(StrEnum):
    INVITE = "invite"
    PASSWORD_RESET = "password_reset"


class UserInvitation(UUIDMixin, TimestampMixin, Base):
    """Одноразовая ссылка для установки пароля.

    Сам токен в базе не хранится — только его SHA-256. Утечка дампа не даёт
    возможности войти по чужой ссылке.
    """

    __tablename__ = "user_invitations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    purpose: Mapped[InvitationPurpose] = mapped_column(
        Enum(
            InvitationPurpose,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        default=InvitationPurpose.INVITE,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )

    user: Mapped["User"] = relationship(foreign_keys=[user_id], lazy="joined")
