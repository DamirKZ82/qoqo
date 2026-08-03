import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.api.routes.settings import save_upload
from app.core.deps import DbSession, require_roles
from app.models import EDITOR_ROLES
from app.models.content import BLOCK_TITLES, BlockType, ContentBlock
from app.schemas.content import (
    ContentBlockRead,
    ContentBlockWrite,
    ReorderRequest,
    UploadedFile,
)

router = APIRouter(prefix="/content", tags=["Контент главной страницы"])

# Контент правят администратор и менеджер — это редакторская, а не техническая задача.
editor_only = Depends(require_roles(*EDITOR_ROLES))


def serialize(block: ContentBlock) -> dict[str, Any]:
    return {
        "id": block.id,
        "block_type": block.block_type,
        "block_type_title": BLOCK_TITLES.get(block.block_type, block.block_type.value),
        "title": block.title,
        "subtitle": block.subtitle,
        "sort_order": block.sort_order,
        "is_visible": block.is_visible,
        "payload": block.payload or {},
        "translations": block.translations or {},
    }


def get_or_404(db: DbSession, block_id: uuid.UUID) -> ContentBlock:
    block = db.get(ContentBlock, block_id)
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Блок не найден")
    return block


@router.get("/blocks", response_model=list[ContentBlockRead])
def list_blocks(db: DbSession, include_hidden: bool = False) -> Any:
    """Публичный эндпоинт: лендинг забирает отсюда всё содержимое."""

    stmt = select(ContentBlock)
    if not include_hidden:
        stmt = stmt.where(ContentBlock.is_visible.is_(True))
    rows = db.execute(stmt.order_by(ContentBlock.sort_order, ContentBlock.created_at)).scalars()
    return [serialize(row) for row in rows]


@router.get("/block-types", response_model=dict[str, str])
def list_block_types() -> dict[str, str]:
    return {item.value: BLOCK_TITLES[item] for item in BlockType}


@router.post("/blocks", response_model=ContentBlockRead, status_code=status.HTTP_201_CREATED)
def create_block(payload: ContentBlockWrite, db: DbSession, _: Any = editor_only) -> Any:
    block = ContentBlock(**payload.model_dump())
    db.add(block)
    db.commit()
    db.refresh(block)
    return serialize(block)


@router.put("/blocks/{block_id}", response_model=ContentBlockRead)
def update_block(
    block_id: uuid.UUID, payload: ContentBlockWrite, db: DbSession, _: Any = editor_only
) -> Any:
    block = get_or_404(db, block_id)
    for field, value in payload.model_dump().items():
        setattr(block, field, value)
    db.commit()
    db.refresh(block)
    return serialize(block)


@router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_block(block_id: uuid.UUID, db: DbSession, _: Any = editor_only) -> None:
    db.delete(get_or_404(db, block_id))
    db.commit()


@router.post("/blocks/reorder", response_model=list[ContentBlockRead])
def reorder_blocks(payload: ReorderRequest, db: DbSession, _: Any = editor_only) -> Any:
    by_id = {item.id: item.sort_order for item in payload.items}
    blocks = (
        db.execute(select(ContentBlock).where(ContentBlock.id.in_(by_id.keys()))).scalars().all()
    )

    for block in blocks:
        block.sort_order = by_id[block.id]
    db.commit()

    rows = db.execute(
        select(ContentBlock).order_by(ContentBlock.sort_order, ContentBlock.created_at)
    ).scalars()
    return [serialize(row) for row in rows]


@router.post("/upload", response_model=UploadedFile)
def upload_image(file: UploadFile = File(...), _: Any = editor_only) -> UploadedFile:
    """Загрузка картинки для блока — возвращает URL для вставки в payload."""

    return UploadedFile(url=save_upload(file, "content"))
