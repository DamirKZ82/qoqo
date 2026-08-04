import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession
from app.models import Nomenclature, Order, UserRole
from app.models.returns import (
    REASON_TITLES,
    UNSALEABLE_REASONS,
    Return,
    ReturnLine,
    ReturnReason,
    ReturnStatus,
)
from app.schemas.common import ORMModel, Page
from app.services import returns as returns_service

router = APIRouter(prefix="/returns", tags=["Возвраты"])

# Возврат принимают склад и те, кто ведёт заявки: товар физически приезжает.
EDITOR_ROLES = (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.WAREHOUSE, UserRole.ACCOUNTANT)


class ReturnLineWrite(BaseModel):
    nomenclature_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    price: Decimal | None = Field(default=None, ge=0)


class ReturnLineRead(ORMModel):
    id: uuid.UUID
    line_number: int
    nomenclature_id: uuid.UUID
    nomenclature_name: str
    unit_name: str | None
    quantity: Decimal
    price: Decimal
    amount: Decimal


class ReturnWrite(BaseModel):
    counterparty_id: uuid.UUID
    outlet_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None
    warehouse_id: uuid.UUID
    return_date: date | None = None
    reason: ReturnReason = ReturnReason.OTHER
    comment: str | None = Field(default=None, max_length=1000)
    lines: list[ReturnLineWrite] = Field(default_factory=list)


class ReturnRead(ORMModel):
    id: uuid.UUID
    number: int
    display_number: str
    return_date: date
    status: ReturnStatus
    counterparty_id: uuid.UUID
    counterparty_name: str
    outlet_id: uuid.UUID | None
    outlet_name: str | None
    order_id: uuid.UUID | None
    warehouse_id: uuid.UUID
    warehouse_name: str
    author_name: str | None
    reason: ReturnReason
    reason_title: str
    # Товар с этой причиной обратно в продажу не идёт.
    unsaleable: bool
    comment: str | None
    total_amount: Decimal
    lines_count: int
    lines: list[ReturnLineRead] = Field(default_factory=list)


def _require_editor(user: Any) -> None:
    if user.role not in EDITOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Возвраты оформляют склад, бухгалтер, директор и администратор",
        )


def serialize(document: Return, *, with_lines: bool = True) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": document.id,
        "number": document.number,
        "display_number": document.display_number,
        "return_date": document.return_date,
        "status": document.status,
        "counterparty_id": document.counterparty_id,
        "counterparty_name": document.counterparty.name if document.counterparty else "",
        "outlet_id": document.outlet_id,
        "outlet_name": document.outlet.name if document.outlet else None,
        "order_id": document.order_id,
        "warehouse_id": document.warehouse_id,
        "warehouse_name": document.warehouse.name if document.warehouse else "",
        "author_name": document.author.full_name if document.author else None,
        "reason": document.reason,
        "reason_title": REASON_TITLES.get(document.reason, document.reason.value),
        "unsaleable": document.reason in UNSALEABLE_REASONS,
        "comment": document.comment,
        "total_amount": document.total_amount,
        "lines_count": len(document.lines),
        "lines": [],
    }

    if with_lines:
        data["lines"] = [
            {
                "id": line.id,
                "line_number": line.line_number,
                "nomenclature_id": line.nomenclature_id,
                "nomenclature_name": line.nomenclature.name if line.nomenclature else "",
                "unit_name": (
                    line.nomenclature.base_unit.name
                    if line.nomenclature and line.nomenclature.base_unit
                    else None
                ),
                "quantity": line.quantity,
                "price": line.price,
                "amount": line.amount,
            }
            for line in document.lines
        ]

    return data


def _get(db: DbSession, document_id: uuid.UUID) -> Return:
    document = db.get(Return, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Возврат не найден")
    return document


@router.get("", response_model=Page[ReturnRead])
def list_returns(
    db: DbSession,
    _: CurrentUser,
    counterparty_id: uuid.UUID | None = None,
    document_status: ReturnStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Any:
    stmt = select(Return).options(selectinload(Return.lines))
    if counterparty_id is not None:
        stmt = stmt.where(Return.counterparty_id == counterparty_id)
    if document_status is not None:
        stmt = stmt.where(Return.status == document_status)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(stmt.order_by(Return.number.desc()).limit(limit).offset(offset))
        .unique()
        .scalars()
        .all()
    )

    return Page(
        items=[serialize(row, with_lines=False) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{document_id}", response_model=ReturnRead)
def get_return(document_id: uuid.UUID, db: DbSession, _: CurrentUser) -> Any:
    return serialize(_get(db, document_id))


def _fill_lines(db: DbSession, document: Return, payload: ReturnWrite) -> None:
    document.lines.clear()
    db.flush()

    total = Decimal(0)
    for index, line in enumerate(payload.lines, start=1):
        product = db.get(Nomenclature, line.nomenclature_id)
        if product is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Номенклатура {line.nomenclature_id} не найдена",
            )
        # Цена по умолчанию — из заявки, иначе возврат уменьшит долг не на ту
        # сумму, за которую товар отгружали.
        price = line.price if line.price is not None else _order_price(db, payload, product.id)
        amount = (Decimal(line.quantity) * Decimal(price)).quantize(Decimal("0.01"))
        total += amount
        document.lines.append(
            ReturnLine(
                line_number=index,
                nomenclature_id=product.id,
                quantity=line.quantity,
                price=price,
                amount=amount,
            )
        )

    document.total_amount = total


def _order_price(db: DbSession, payload: ReturnWrite, nomenclature_id: uuid.UUID) -> Decimal:
    """Цена из связанной заявки; если её нет — текущая цена номенклатуры."""

    if payload.order_id is not None:
        order = db.get(Order, payload.order_id)
        if order is not None:
            for line in order.lines:
                if line.nomenclature_id == nomenclature_id:
                    return Decimal(line.price)

    product = db.get(Nomenclature, nomenclature_id)
    return Decimal(product.price) if product else Decimal(0)


@router.post("", response_model=ReturnRead, status_code=status.HTTP_201_CREATED)
def create_return(payload: ReturnWrite, db: DbSession, user: CurrentUser) -> Any:
    _require_editor(user)

    document = Return(
        counterparty_id=payload.counterparty_id,
        outlet_id=payload.outlet_id,
        order_id=payload.order_id,
        warehouse_id=payload.warehouse_id,
        return_date=payload.return_date or datetime.now(UTC).date(),
        reason=payload.reason,
        comment=payload.comment,
        author_id=user.id,
    )
    db.add(document)
    db.flush()

    _fill_lines(db, document, payload)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.put("/{document_id}", response_model=ReturnRead)
def update_return(
    document_id: uuid.UUID, payload: ReturnWrite, db: DbSession, user: CurrentUser
) -> Any:
    _require_editor(user)
    document = _get(db, document_id)

    if document.status is ReturnStatus.POSTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сначала отмените проведение возврата",
        )

    document.counterparty_id = payload.counterparty_id
    document.outlet_id = payload.outlet_id
    document.order_id = payload.order_id
    document.warehouse_id = payload.warehouse_id
    document.return_date = payload.return_date or document.return_date
    document.reason = payload.reason
    document.comment = payload.comment

    _fill_lines(db, document, payload)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.post("/{document_id}/post", response_model=ReturnRead)
def post_return(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Any:
    """Проводит возврат: товар на склад, долг контрагента вниз."""

    _require_editor(user)
    document = _get(db, document_id)

    if not document.lines:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нельзя провести возврат без позиций",
        )

    returns_service.post(db, document)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.post("/{document_id}/unpost", response_model=ReturnRead)
def unpost_return(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Any:
    _require_editor(user)
    document = _get(db, document_id)

    returns_service.unpost(db, document)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_return(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    _require_editor(user)
    document = _get(db, document_id)

    if document.status is ReturnStatus.POSTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сначала отмените проведение возврата",
        )

    db.delete(document)
    db.commit()
