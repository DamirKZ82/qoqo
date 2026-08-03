import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.api.routes.orders import _get_order_for_user
from app.core.deps import CurrentUser, DbSession
from app.models import FULFILMENT_ROLES, Nomenclature, UserRole, Warehouse
from app.models.stock import (
    DOCUMENT_TITLES,
    StockDocument,
    StockDocumentLine,
    StockDocumentStatus,
    StockDocumentType,
)
from app.schemas.common import Page
from app.schemas.stock import (
    OrderStockCheck,
    ShortageRow,
    StockBalanceRow,
    StockDocumentRead,
    StockDocumentWrite,
)
from app.services import stock

router = APIRouter(prefix="/stock", tags=["Склад: остатки"])

# Документы склада заводят те же роли, что ведут заявку по сборке и отгрузке.
EDITOR_ROLES = FULFILMENT_ROLES


def _require_editor(user: Any) -> None:
    if user.role not in EDITOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Складские документы заводят склад, директор и администратор",
        )


def _visible_warehouse(user: Any) -> uuid.UUID | None:
    """Склад, которым ограничен сотрудник. None — ограничения нет."""

    if user.role == UserRole.WAREHOUSE:
        return user.warehouse_id
    return None


def serialize(document: StockDocument, *, with_lines: bool = True) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": document.id,
        "number": document.number,
        "display_number": document.display_number,
        "document_type": document.document_type,
        "document_type_title": DOCUMENT_TITLES.get(
            document.document_type, document.document_type.value
        ),
        "status": document.status,
        "document_date": document.document_date,
        "warehouse_id": document.warehouse_id,
        "warehouse_name": document.warehouse.name if document.warehouse else "",
        "author_name": document.author.full_name if document.author else None,
        "order_id": document.order_id,
        "comment": document.comment,
        "total_amount": document.total_amount,
        "lines_count": len(document.lines),
        "created_at": document.created_at,
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
                "expected_quantity": line.expected_quantity,
            }
            for line in document.lines
        ]

    return data


# --- Остатки -------------------------------------------------------------


@router.get("/balance", response_model=list[StockBalanceRow])
def stock_balance(
    db: DbSession,
    user: CurrentUser,
    warehouse_id: uuid.UUID | None = None,
    search: str | None = None,
    only_positive: bool = False,
) -> Any:
    """Остатки по складам с учётом резерва под принятые заявки."""

    scope = _visible_warehouse(user) or warehouse_id
    quantities = stock.balances(db, scope)
    busy = stock.reserved(db, scope)

    # Позиции показываем и те, что только зарезервированы: нулевой остаток при
    # непокрытом резерве — как раз то, что нужно увидеть.
    keys = set(quantities) | set(busy)
    if not keys:
        return []

    warehouses = {
        row.id: row
        for row in db.execute(
            select(Warehouse).where(Warehouse.id.in_({key[0] for key in keys}))
        ).scalars()
    }
    products = {
        row.id: row
        for row in db.execute(
            select(Nomenclature).where(Nomenclature.id.in_({key[1] for key in keys}))
        )
        .unique()
        .scalars()
    }

    rows: list[StockBalanceRow] = []
    for warehouse_key, nomenclature_key in keys:
        product = products.get(nomenclature_key)
        warehouse = warehouses.get(warehouse_key)
        if product is None or warehouse is None:
            continue

        if search and search.strip().lower() not in product.name.lower():
            continue

        quantity = quantities.get((warehouse_key, nomenclature_key), Decimal(0))
        reserve = busy.get((warehouse_key, nomenclature_key), Decimal(0))

        if only_positive and quantity <= 0:
            continue

        rows.append(
            StockBalanceRow(
                warehouse_id=warehouse_key,
                warehouse_name=warehouse.name,
                nomenclature_id=nomenclature_key,
                nomenclature_name=product.name,
                nomenclature_code=product.code,
                unit_name=product.base_unit.name if product.base_unit else None,
                quantity=quantity,
                reserved=reserve,
                available=quantity - reserve,
            )
        )

    rows.sort(key=lambda row: (row.warehouse_name, row.nomenclature_name))
    return rows


@router.get("/orders/{order_id}/check", response_model=OrderStockCheck)
def check_order(order_id: uuid.UUID, db: DbSession, user: CurrentUser) -> OrderStockCheck:
    """Хватит ли остатка, чтобы собрать заявку."""

    order = _get_order_for_user(db, user, order_id)
    missing = stock.shortages(db, order)

    return OrderStockCheck(
        warehouse_id=order.warehouse_id,
        enough=not missing,
        shortages=[
            ShortageRow(
                nomenclature_id=line.nomenclature_id,
                nomenclature_name=line.nomenclature.name if line.nomenclature else "",
                requested=Decimal(line.quantity),
                available=Decimal(line.quantity) - shortage,
                missing=shortage,
            )
            for line, shortage in missing
        ],
    )


# --- Документы -----------------------------------------------------------


@router.get("/documents", response_model=Page[StockDocumentRead])
def list_documents(
    db: DbSession,
    user: CurrentUser,
    document_type: StockDocumentType | None = None,
    document_status: StockDocumentStatus | None = Query(default=None, alias="status"),
    warehouse_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Any:
    from sqlalchemy import func as sa_func

    stmt = select(StockDocument).options(selectinload(StockDocument.lines))

    scope = _visible_warehouse(user)
    if scope is not None:
        stmt = stmt.where(
            or_(StockDocument.warehouse_id == scope, StockDocument.warehouse_id.is_(None))
        )
    if document_type is not None:
        stmt = stmt.where(StockDocument.document_type == document_type)
    if document_status is not None:
        stmt = stmt.where(StockDocument.status == document_status)
    if warehouse_id is not None:
        stmt = stmt.where(StockDocument.warehouse_id == warehouse_id)

    total = db.execute(select(sa_func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(stmt.order_by(StockDocument.number.desc()).limit(limit).offset(offset))
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


def _get_document(db: DbSession, document_id: uuid.UUID) -> StockDocument:
    document = db.get(StockDocument, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Документ не найден")
    return document


@router.get("/documents/{document_id}", response_model=StockDocumentRead)
def get_document(document_id: uuid.UUID, db: DbSession, _: CurrentUser) -> Any:
    return serialize(_get_document(db, document_id))


def _fill_lines(db: DbSession, document: StockDocument, payload: StockDocumentWrite) -> None:
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

        amount = (Decimal(line.quantity) * Decimal(line.price)).quantize(Decimal("0.01"))
        total += amount
        document.lines.append(
            StockDocumentLine(
                line_number=index,
                nomenclature_id=product.id,
                quantity=line.quantity,
                price=line.price,
                amount=amount,
            )
        )

    document.total_amount = total


@router.post("/documents", response_model=StockDocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(payload: StockDocumentWrite, db: DbSession, user: CurrentUser) -> Any:
    _require_editor(user)

    if payload.document_type is StockDocumentType.SHIPMENT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Отгрузка создаётся автоматически при отгрузке заявки",
        )

    document = StockDocument(
        document_type=payload.document_type,
        warehouse_id=payload.warehouse_id,
        document_date=payload.document_date or datetime.now(UTC),
        comment=payload.comment,
        author_id=user.id,
    )
    db.add(document)
    db.flush()

    _fill_lines(db, document, payload)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.put("/documents/{document_id}", response_model=StockDocumentRead)
def update_document(
    document_id: uuid.UUID, payload: StockDocumentWrite, db: DbSession, user: CurrentUser
) -> Any:
    _require_editor(user)
    document = _get_document(db, document_id)

    if document.status is StockDocumentStatus.POSTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сначала отмените проведение документа",
        )

    document.warehouse_id = payload.warehouse_id
    document.document_date = payload.document_date or document.document_date
    document.comment = payload.comment

    _fill_lines(db, document, payload)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.post("/documents/{document_id}/post", response_model=StockDocumentRead)
def post_document(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Any:
    """Проводит документ — движения появляются в остатках."""

    _require_editor(user)
    document = _get_document(db, document_id)

    if not document.lines:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нельзя провести документ без строк",
        )

    stock.post(db, document)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.post("/documents/{document_id}/unpost", response_model=StockDocumentRead)
def unpost_document(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Any:
    _require_editor(user)
    document = _get_document(db, document_id)

    if document.order_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Отгрузка по заявке отменяется через саму заявку",
        )

    stock.unpost(db, document)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    _require_editor(user)
    document = _get_document(db, document_id)

    if document.status is StockDocumentStatus.POSTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сначала отмените проведение документа",
        )

    db.delete(document)
    db.commit()
