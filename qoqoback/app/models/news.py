from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class PostCategory(StrEnum):
    NEWS = "news"
    PROMO = "promo"
    ANNOUNCEMENT = "announcement"


CATEGORY_TITLES: dict[PostCategory, str] = {
    PostCategory.NEWS: "Новость",
    PostCategory.PROMO: "Акция",
    PostCategory.ANNOUNCEMENT: "Объявление",
}


class NewsPost(UUIDMixin, TimestampMixin, Base):
    """Новость или акция компании."""

    __tablename__ = "news_posts"

    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(1000))
    body: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(String(500))

    category: Mapped[PostCategory] = mapped_column(
        Enum(
            PostCategory,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        default=PostCategory.NEWS,
        nullable=False,
        index=True,
    )

    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    # Срок действия акции; для новостей не заполняется.
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
