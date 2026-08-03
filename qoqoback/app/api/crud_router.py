import uuid
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession, require_roles
from app.db.base import Base
from app.models import EDITOR_ROLES
from app.schemas.common import Page


def build_reference_router(
    *,
    model: type[Base],
    write_schema: type[BaseModel],
    read_schema: type[BaseModel],
    prefix: str,
    tag: str,
    search_fields: tuple[str, ...] = ("name", "code"),
    serializer: Callable[[Any], dict[str, Any]] | None = None,
) -> APIRouter:
    """Собирает стандартный CRUD-роутер для справочника.

    Все справочники устроены одинаково, поэтому вместо семи почти одинаковых
    модулей — одна фабрика.
    """

    router = APIRouter(prefix=prefix, tags=[tag])
    editor = Depends(require_roles(*EDITOR_ROLES))

    def to_read(obj: Any) -> Any:
        if serializer is None:
            return read_schema.model_validate(obj)
        return read_schema.model_validate(serializer(obj))

    def get_or_404(db: Session, item_id: uuid.UUID) -> Any:
        obj = db.get(model, item_id)
        if obj is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Элемент не найден")
        return obj

    @router.get("", response_model=Page[read_schema])
    def list_items(
        db: DbSession,
        _: CurrentUser,
        search: str | None = None,
        only_active: bool = True,
        # Универсальные фильтры по владельцу — применяются, если у модели есть
        # соответствующая колонка. Так один список обслуживает и «торговые точки
        # контрагента», и «номенклатуру группы».
        counterparty_id: uuid.UUID | None = None,
        outlet_type_id: uuid.UUID | None = None,
        category_id: uuid.UUID | None = None,
        organization_id: uuid.UUID | None = None,
        parent_id: uuid.UUID | None = None,
        limit: int = Query(default=50, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> Any:
        stmt = select(model)
        if only_active:
            stmt = stmt.where(model.is_active.is_(True))

        owner_filters = {
            "counterparty_id": counterparty_id,
            "outlet_type_id": outlet_type_id,
            "category_id": category_id,
            "organization_id": organization_id,
            "parent_id": parent_id,
        }
        for field, value in owner_filters.items():
            if value is not None and hasattr(model, field):
                stmt = stmt.where(getattr(model, field) == value)

        if search:
            pattern = f"%{search.strip()}%"
            conditions = [
                getattr(model, field).ilike(pattern)
                for field in search_fields
                if hasattr(model, field)
            ]
            if conditions:
                stmt = stmt.where(or_(*conditions))

        total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
        rows = db.execute(stmt.order_by(model.name).limit(limit).offset(offset)).unique().scalars()

        return Page(items=[to_read(row) for row in rows], total=total, limit=limit, offset=offset)

    @router.get("/{item_id}", response_model=read_schema)
    def get_item(item_id: uuid.UUID, db: DbSession, _: CurrentUser) -> Any:
        return to_read(get_or_404(db, item_id))

    @router.post("", response_model=read_schema, status_code=status.HTTP_201_CREATED)
    def create_item(payload: write_schema, db: DbSession, _: Any = editor) -> Any:
        data = payload.model_dump(exclude_unset=False)
        # id приходит только при заведении объекта с готовым GUID (например, из 1С).
        if data.get("id") is None:
            data.pop("id", None)

        obj = model(**data)
        db.add(obj)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Нарушено ограничение целостности: проверьте связанные элементы",
            ) from exc
        db.refresh(obj)
        return to_read(obj)

    @router.put("/{item_id}", response_model=read_schema)
    def update_item(
        item_id: uuid.UUID, payload: write_schema, db: DbSession, _: Any = editor
    ) -> Any:
        obj = get_or_404(db, item_id)
        data = payload.model_dump(exclude_unset=True)
        data.pop("id", None)
        for field, value in data.items():
            setattr(obj, field, value)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Нарушено ограничение целостности: проверьте связанные элементы",
            ) from exc
        db.refresh(obj)
        return to_read(obj)

    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def deactivate_item(item_id: uuid.UUID, db: DbSession, _: Any = editor) -> None:
        # Физически не удаляем: на элемент могут ссылаться проведённые документы.
        obj = get_or_404(db, item_id)
        obj.is_active = False
        db.commit()

    return router
