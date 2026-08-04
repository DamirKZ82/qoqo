"""Подбор цены для заявки.

Порядок такой: цена по типу из договора, затем базовая цена номенклатуры.
Скидка договора применяется поверх. Так продавец не вводит цены руками, а
значит не ошибается в них.
"""

import uuid
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Contract, Nomenclature
from app.models.price import Price, PriceType


@dataclass(slots=True)
class ResolvedPrice:
    nomenclature_id: uuid.UUID
    # Цена до скидки: по типу из договора либо базовая.
    base_price: Decimal
    discount_percent: Decimal
    price: Decimal
    price_type_id: uuid.UUID | None
    price_type_name: str | None
    # Откуда взялась цена: type — из типа цен, base — базовая из номенклатуры.
    source: str


def default_price_type(db: Session) -> PriceType | None:
    return (
        db.execute(
            select(PriceType)
            .where(PriceType.is_default.is_(True))
            .where(PriceType.is_active.is_(True))
        )
        .unique()
        .scalars()
        .first()
    )


def apply_discount(price: Decimal, discount_percent: Decimal) -> Decimal:
    if discount_percent <= 0:
        return Decimal(price)
    factor = (Decimal(100) - Decimal(discount_percent)) / Decimal(100)
    return (Decimal(price) * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def resolve(
    db: Session,
    nomenclature_ids: list[uuid.UUID],
    *,
    contract_id: uuid.UUID | None = None,
) -> dict[uuid.UUID, ResolvedPrice]:
    """Считает цены для набора позиций по договору."""

    if not nomenclature_ids:
        return {}

    price_type: PriceType | None = None
    discount = Decimal(0)

    if contract_id is not None:
        contract = db.get(Contract, contract_id)
        if contract is not None:
            discount = Decimal(contract.discount_percent or 0)
            if contract.price_type_id is not None:
                price_type = db.get(PriceType, contract.price_type_id)

    if price_type is None:
        price_type = default_price_type(db)

    by_type: dict[uuid.UUID, Decimal] = {}
    if price_type is not None:
        rows = db.execute(
            select(Price.nomenclature_id, Price.price)
            .where(Price.price_type_id == price_type.id)
            .where(Price.nomenclature_id.in_(nomenclature_ids))
        ).all()
        by_type = {row[0]: Decimal(row[1]) for row in rows}

    products = {
        row.id: row
        for row in db.execute(select(Nomenclature).where(Nomenclature.id.in_(nomenclature_ids)))
        .unique()
        .scalars()
    }

    result: dict[uuid.UUID, ResolvedPrice] = {}
    for nomenclature_id in nomenclature_ids:
        product = products.get(nomenclature_id)
        if product is None:
            continue

        if nomenclature_id in by_type:
            base = by_type[nomenclature_id]
            source = "type"
        else:
            # Цены по типу нет — берём базовую, иначе продавец не сможет
            # выписать заявку на новый товар.
            base = Decimal(product.price)
            source = "base"

        result[nomenclature_id] = ResolvedPrice(
            nomenclature_id=nomenclature_id,
            base_price=base,
            discount_percent=discount,
            price=apply_discount(base, discount),
            price_type_id=price_type.id if price_type else None,
            price_type_name=price_type.name if price_type else None,
            source=source,
        )

    return result


def price_for(db: Session, nomenclature_id: uuid.UUID, contract_id: uuid.UUID | None) -> Decimal:
    """Цена одной позиции. Используется при создании заявки на сервере."""

    resolved = resolve(db, [nomenclature_id], contract_id=contract_id)
    item = resolved.get(nomenclature_id)
    return item.price if item else Decimal(0)
