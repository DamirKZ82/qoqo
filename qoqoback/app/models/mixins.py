import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column


class UUIDMixin:
    """Первичный ключ — GUID.

    Значение можно задать снаружи: при синхронизации с 1С сюда кладётся Ref_Key
    соответствующего объекта, поэтому идентификаторы не придётся перематчивать.
    """

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ReferenceMixin(UUIDMixin, TimestampMixin):
    """Общие реквизиты справочника: код, наименование, пометка удаления."""

    code: Mapped[str | None] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(500), index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
