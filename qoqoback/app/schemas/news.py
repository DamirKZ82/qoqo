import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.news import PostCategory
from app.schemas.common import ORMModel


class NewsPostRead(ORMModel):
    id: uuid.UUID
    slug: str
    title: str
    summary: str | None
    body: str | None
    cover_url: str | None
    category: PostCategory
    category_title: str
    translations: dict[str, Any]
    is_published: bool
    is_pinned: bool
    published_at: datetime | None
    valid_until: datetime | None
    created_at: datetime


class NewsPostWrite(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    # Пустой slug генерируется из заголовка транслитерацией.
    slug: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=1000)
    body: str | None = None
    cover_url: str | None = None
    category: PostCategory = PostCategory.NEWS
    # {"kk": {"title": ..., "summary": ..., "body": ...}}
    translations: dict[str, Any] = Field(default_factory=dict)
    is_published: bool = False
    is_pinned: bool = False
    published_at: datetime | None = None
    valid_until: datetime | None = None
