from enum import StrEnum
from typing import Any

from sqlalchemy import Boolean, Enum, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class BlockType(StrEnum):
    """Тип секции лендинга. Определяет, какую форму показать в админке."""

    HERO = "hero"
    FEATURES = "features"
    CATALOG = "catalog"
    ABOUT = "about"
    CERTIFICATES = "certificates"
    CONTACTS = "contacts"
    CTA = "cta"
    NEWS = "news"


BLOCK_TITLES: dict[BlockType, str] = {
    BlockType.HERO: "Первый экран",
    BlockType.FEATURES: "Преимущества",
    BlockType.CATALOG: "Каталог продукции",
    BlockType.ABOUT: "О компании",
    BlockType.CERTIFICATES: "Сертификаты",
    BlockType.CONTACTS: "Контакты",
    BlockType.CTA: "Призыв к действию",
    BlockType.NEWS: "Новости и акции",
}


class ContentBlock(UUIDMixin, TimestampMixin, Base):
    """Секция главной страницы.

    Содержимое лежит в JSONB: состав полей у разных типов блоков разный, и так
    его можно менять без миграции. Структуру валидируют схемы на уровне API.
    """

    __tablename__ = "content_blocks"

    block_type: Mapped[BlockType] = mapped_column(
        Enum(
            BlockType,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        nullable=False,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String(300))
    subtitle: Mapped[str | None] = mapped_column(String(1000))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    # Переводы поверх базовых полей: {"kk": {"title": ..., "subtitle": ..., "payload": {...}}}.
    # Базовые поля — язык по умолчанию (русский); при отсутствии перевода
    # показывается именно он, чтобы недопереведённая страница не зияла пустотами.
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
