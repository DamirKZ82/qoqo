import uuid
from typing import Any

from pydantic import BaseModel, Field

from app.models.content import BlockType
from app.schemas.common import ORMModel


class ContentBlockRead(ORMModel):
    id: uuid.UUID
    block_type: BlockType
    block_type_title: str
    title: str | None
    subtitle: str | None
    sort_order: int
    is_visible: bool
    payload: dict[str, Any]
    translations: dict[str, Any]


class ContentBlockWrite(BaseModel):
    block_type: BlockType
    title: str | None = Field(default=None, max_length=300)
    subtitle: str | None = Field(default=None, max_length=1000)
    sort_order: int = 0
    is_visible: bool = True
    payload: dict[str, Any] = Field(default_factory=dict)
    # {"kk": {"title": ..., "subtitle": ..., "payload": {...}}}
    translations: dict[str, Any] = Field(default_factory=dict)


class BlockOrderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class ReorderRequest(BaseModel):
    items: list[BlockOrderItem]


class UploadedFile(BaseModel):
    url: str
