import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import DbSession, require_roles
from app.models import EDITOR_ROLES
from app.models.news import CATEGORY_TITLES, NewsPost, PostCategory
from app.schemas.common import Page
from app.schemas.news import NewsPostRead, NewsPostWrite
from app.services.slug import slugify

router = APIRouter(prefix="/news", tags=["Новости и акции"])

editor_only = Depends(require_roles(*EDITOR_ROLES))


def serialize(post: NewsPost) -> dict[str, Any]:
    return {
        "id": post.id,
        "slug": post.slug,
        "title": post.title,
        "summary": post.summary,
        "body": post.body,
        "cover_url": post.cover_url,
        "category": post.category,
        "category_title": CATEGORY_TITLES.get(post.category, post.category.value),
        "is_published": post.is_published,
        "is_pinned": post.is_pinned,
        "published_at": post.published_at,
        "valid_until": post.valid_until,
        "created_at": post.created_at,
    }


def unique_slug(db: DbSession, base: str, *, exclude_id: uuid.UUID | None = None) -> str:
    slug = base
    suffix = 2
    while True:
        stmt = select(NewsPost).where(NewsPost.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(NewsPost.id != exclude_id)
        if db.execute(stmt).scalar_one_or_none() is None:
            return slug
        slug = f"{base}-{suffix}"
        suffix += 1


@router.get("", response_model=Page[NewsPostRead])
def list_posts(
    db: DbSession,
    category: PostCategory | None = None,
    published_only: bool = True,
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Any:
    """Публичный список. Черновики отдаются только при published_only=false."""

    stmt = select(NewsPost)
    if published_only:
        stmt = stmt.where(NewsPost.is_published.is_(True))
    if category is not None:
        stmt = stmt.where(NewsPost.category == category)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(or_(NewsPost.title.ilike(pattern), NewsPost.summary.ilike(pattern)))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(
        stmt.order_by(
            NewsPost.is_pinned.desc(),
            func.coalesce(NewsPost.published_at, NewsPost.created_at).desc(),
        )
        .limit(limit)
        .offset(offset)
    ).scalars()

    return Page(items=[serialize(row) for row in rows], total=total, limit=limit, offset=offset)


@router.get("/{slug}", response_model=NewsPostRead)
def get_post(slug: str, db: DbSession) -> Any:
    post = db.execute(select(NewsPost).where(NewsPost.slug == slug)).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Публикация не найдена")
    return serialize(post)


@router.post("", response_model=NewsPostRead, status_code=status.HTTP_201_CREATED)
def create_post(payload: NewsPostWrite, db: DbSession, _: Any = editor_only) -> Any:
    data = payload.model_dump()
    data["slug"] = unique_slug(db, slugify(payload.slug or payload.title))

    # Публикуем — значит проставляем дату, если её не указали руками.
    if data["is_published"] and data["published_at"] is None:
        data["published_at"] = datetime.now(UTC)

    post = NewsPost(**data)
    db.add(post)
    db.commit()
    db.refresh(post)
    return serialize(post)


@router.put("/{post_id}", response_model=NewsPostRead)
def update_post(
    post_id: uuid.UUID, payload: NewsPostWrite, db: DbSession, _: Any = editor_only
) -> Any:
    post = db.get(NewsPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Публикация не найдена")

    data = payload.model_dump()
    data["slug"] = unique_slug(db, slugify(payload.slug or payload.title), exclude_id=post.id)
    if data["is_published"] and data["published_at"] is None:
        data["published_at"] = datetime.now(UTC)

    for field, value in data.items():
        setattr(post, field, value)

    db.commit()
    db.refresh(post)
    return serialize(post)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: uuid.UUID, db: DbSession, _: Any = editor_only) -> None:
    post = db.get(NewsPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Публикация не найдена")
    db.delete(post)
    db.commit()
