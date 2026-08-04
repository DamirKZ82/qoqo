import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.models import EDITOR_ROLES, Nomenclature
from app.models.price import Price, PriceType
from app.services import pricing

router = APIRouter(prefix="/prices", tags=["Цены"])


class PriceCell(BaseModel):
    price_type_id: uuid.UUID
    price_type_name: str
    price: Decimal | None


class PriceRow(BaseModel):
    """Строка таблицы цен: товар и его цены по всем типам."""

    nomenclature_id: uuid.UUID
    nomenclature_name: str
    nomenclature_code: str | None
    unit_name: str | None
    # Базовая цена из карточки товара — запасной вариант, если по типу цены нет.
    base_price: Decimal
    prices: list[PriceCell]


class PriceMatrix(BaseModel):
    types: list[PriceCell]
    rows: list[PriceRow]
    total: int


class PriceSet(BaseModel):
    nomenclature_id: uuid.UUID
    price_type_id: uuid.UUID
    # Пустое значение убирает цену по типу: товар вернётся к базовой.
    price: Decimal | None = Field(default=None, ge=0)


class PriceBulkWrite(BaseModel):
    items: list[PriceSet]


class ResolvedPriceRead(BaseModel):
    nomenclature_id: uuid.UUID
    base_price: Decimal
    discount_percent: Decimal
    price: Decimal
    price_type_id: uuid.UUID | None
    price_type_name: str | None
    source: str


def _require_editor(user: Any) -> None:
    if user.role not in EDITOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Цены ведут администратор, директор и бухгалтер",
        )


@router.get("", response_model=PriceMatrix)
def price_matrix(
    db: DbSession,
    _: CurrentUser,
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> PriceMatrix:
    """Таблица «товар × тип цены» — так цены удобнее заполнять и сверять."""

    types = (
        db.execute(
            select(PriceType)
            .where(PriceType.is_active.is_(True))
            .order_by(PriceType.sort_order, PriceType.name)
        )
        .unique()
        .scalars()
        .all()
    )

    stmt = select(Nomenclature).where(Nomenclature.is_active.is_(True))
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(or_(Nomenclature.name.ilike(pattern), Nomenclature.code.ilike(pattern)))
    if category_id is not None:
        stmt = stmt.where(Nomenclature.category_id == category_id)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    products = (
        db.execute(stmt.order_by(Nomenclature.name).limit(limit).offset(offset))
        .unique()
        .scalars()
        .all()
    )

    stored: dict[tuple[uuid.UUID, uuid.UUID], Decimal] = {}
    if products:
        rows = db.execute(
            select(Price.nomenclature_id, Price.price_type_id, Price.price).where(
                Price.nomenclature_id.in_([item.id for item in products])
            )
        ).all()
        stored = {(row[0], row[1]): Decimal(row[2]) for row in rows}

    return PriceMatrix(
        types=[
            PriceCell(price_type_id=item.id, price_type_name=item.name, price=None)
            for item in types
        ],
        rows=[
            PriceRow(
                nomenclature_id=product.id,
                nomenclature_name=product.name,
                nomenclature_code=product.code,
                unit_name=product.base_unit.name if product.base_unit else None,
                base_price=Decimal(product.price),
                prices=[
                    PriceCell(
                        price_type_id=item.id,
                        price_type_name=item.name,
                        price=stored.get((product.id, item.id)),
                    )
                    for item in types
                ],
            )
            for product in products
        ],
        total=total,
    )


@router.post("", response_model=dict)
def set_prices(payload: PriceBulkWrite, db: DbSession, user: CurrentUser) -> dict[str, int]:
    """Записывает цены пачкой. Пустая цена удаляет запись по типу."""

    _require_editor(user)

    saved = removed = 0

    for item in payload.items:
        existing = (
            db.execute(
                select(Price)
                .where(Price.nomenclature_id == item.nomenclature_id)
                .where(Price.price_type_id == item.price_type_id)
            )
            .unique()
            .scalar_one_or_none()
        )

        if item.price is None:
            if existing is not None:
                db.delete(existing)
                removed += 1
            continue

        if existing is None:
            db.add(
                Price(
                    nomenclature_id=item.nomenclature_id,
                    price_type_id=item.price_type_id,
                    price=item.price,
                )
            )
        else:
            existing.price = item.price
        saved += 1

    db.commit()
    return {"saved": saved, "removed": removed}


@router.get("/resolve", response_model=list[ResolvedPriceRead])
def resolve_prices(
    db: DbSession,
    _: CurrentUser,
    nomenclature_ids: list[uuid.UUID] = Query(default_factory=list),
    contract_id: uuid.UUID | None = None,
) -> Any:
    """Цены с учётом типа и скидки договора — то, что подставится в заявку."""

    resolved = pricing.resolve(db, nomenclature_ids, contract_id=contract_id)
    return [
        ResolvedPriceRead(
            nomenclature_id=item.nomenclature_id,
            base_price=item.base_price,
            discount_percent=item.discount_percent,
            price=item.price,
            price_type_id=item.price_type_id,
            price_type_name=item.price_type_name,
            source=item.source,
        )
        for item in resolved.values()
    ]
