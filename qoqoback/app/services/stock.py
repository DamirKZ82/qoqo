"""Остатки на складах: расчёт, резерв и проведение документов."""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Order, OrderLine, OrderStatus
from app.models.stock import (
    DOCUMENT_SIGNS,
    StockDocument,
    StockDocumentLine,
    StockDocumentStatus,
    StockDocumentType,
    StockMovement,
)

# Заявки в этих статусах уже заняли товар, но ещё не отгружены.
RESERVING_STATUSES = (OrderStatus.NEW, OrderStatus.ASSEMBLING, OrderStatus.ASSEMBLED)


def balance_of(db: Session, warehouse_id: uuid.UUID, nomenclature_id: uuid.UUID) -> Decimal:
    """Учётный остаток одной позиции на складе."""

    value = db.execute(
        select(func.coalesce(func.sum(StockMovement.quantity), 0))
        .where(StockMovement.warehouse_id == warehouse_id)
        .where(StockMovement.nomenclature_id == nomenclature_id)
    ).scalar_one()
    return Decimal(value)


def balances(
    db: Session, warehouse_id: uuid.UUID | None = None
) -> dict[tuple[uuid.UUID, uuid.UUID], Decimal]:
    """Остатки по всем позициям: ключ — склад и номенклатура."""

    stmt = select(
        StockMovement.warehouse_id,
        StockMovement.nomenclature_id,
        func.coalesce(func.sum(StockMovement.quantity), 0),
    ).group_by(StockMovement.warehouse_id, StockMovement.nomenclature_id)

    if warehouse_id is not None:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)

    return {(row[0], row[1]): Decimal(row[2]) for row in db.execute(stmt).all()}


def reserved(
    db: Session, warehouse_id: uuid.UUID | None = None
) -> dict[tuple[uuid.UUID, uuid.UUID], Decimal]:
    """Сколько занято принятыми, но ещё не отгруженными заявками.

    Свободный остаток — это учётный минус резерв: иначе один и тот же товар
    пообещали бы двум точкам.
    """

    stmt = (
        select(
            Order.warehouse_id,
            OrderLine.nomenclature_id,
            func.coalesce(func.sum(OrderLine.quantity), 0),
        )
        .select_from(Order)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .where(Order.status.in_(RESERVING_STATUSES))
        .where(Order.warehouse_id.is_not(None))
        .group_by(Order.warehouse_id, OrderLine.nomenclature_id)
    )

    if warehouse_id is not None:
        stmt = stmt.where(Order.warehouse_id == warehouse_id)

    return {(row[0], row[1]): Decimal(row[2]) for row in db.execute(stmt).all()}


def post(db: Session, document: StockDocument) -> None:
    """Проводит документ: создаёт движения по его строкам.

    Повторное проведение сначала снимает прежние движения, поэтому исправленный
    документ не удваивает остаток.
    """

    unpost(db, document)

    for line in document.lines:
        if document.document_type is StockDocumentType.INVENTORY:
            # Инвентаризация выравнивает остаток: движение равно разнице между
            # фактом и тем, что числится.
            current = balance_of(db, document.warehouse_id, line.nomenclature_id)
            quantity = Decimal(line.quantity) - current
            line.expected_quantity = current
        else:
            quantity = Decimal(line.quantity) * DOCUMENT_SIGNS[document.document_type]

        if quantity == 0:
            continue

        db.add(
            StockMovement(
                document_id=document.id,
                warehouse_id=document.warehouse_id,
                nomenclature_id=line.nomenclature_id,
                quantity=quantity,
                moved_at=document.document_date,
            )
        )

    document.status = StockDocumentStatus.POSTED
    db.flush()


def unpost(db: Session, document: StockDocument) -> None:
    """Снимает проведение: удаляет движения документа."""

    db.execute(StockMovement.__table__.delete().where(StockMovement.document_id == document.id))
    document.status = StockDocumentStatus.DRAFT
    db.flush()


def shortages(db: Session, order: Order) -> list[tuple[OrderLine, Decimal]]:
    """Строки заявки, на которые не хватает свободного остатка.

    Возвращает пары «строка — сколько не хватает». Пустой список означает, что
    заявку можно собрать целиком.
    """

    if order.warehouse_id is None:
        return []

    stock = balances(db, order.warehouse_id)
    busy = reserved(db, order.warehouse_id)

    # Заявка в резервирующем статусе уже посчитана в busy — её собственное
    # количество возвращаем обратно, иначе она выглядела бы необеспеченной сама
    # из-за себя. Черновик в busy не попадает, и возвращать нечего.
    counts_itself = order.status in RESERVING_STATUSES

    result: list[tuple[OrderLine, Decimal]] = []
    for line in order.lines:
        key = (order.warehouse_id, line.nomenclature_id)
        own = Decimal(line.quantity) if counts_itself else Decimal(0)
        available = stock.get(key, Decimal(0)) - busy.get(key, Decimal(0)) + own
        missing = Decimal(line.quantity) - available
        if missing > 0:
            result.append((line, missing))

    return result


def shipment_for_order(db: Session, order: Order) -> StockDocument | None:
    """Создаёт и проводит отгрузку по заявке.

    Списывается фактически собранное количество, а не заказанное: склад мог
    отгрузить меньше, и остаток должен отражать то, что реально уехало.
    Повторный вызов переиспользует прежний документ, поэтому двойной перевод
    статуса не спишет товар дважды.
    """

    if order.warehouse_id is None:
        return None

    document = (
        db.execute(
            select(StockDocument)
            .where(StockDocument.order_id == order.id)
            .where(StockDocument.document_type == StockDocumentType.SHIPMENT)
        )
        .unique()
        .scalar_one_or_none()
    )

    if document is None:
        document = StockDocument(
            document_type=StockDocumentType.SHIPMENT,
            warehouse_id=order.warehouse_id,
            order_id=order.id,
            author_id=order.author_id,
            comment=f"Отгрузка по заявке {order.display_number}",
        )
        db.add(document)
        db.flush()

    document.warehouse_id = order.warehouse_id
    document.lines.clear()
    db.flush()

    total = Decimal(0)
    for index, line in enumerate(order.lines, start=1):
        quantity = line.quantity_shipped if line.quantity_shipped is not None else line.quantity
        amount = (Decimal(quantity) * Decimal(line.price)).quantize(Decimal("0.01"))
        total += amount
        document.lines.append(
            StockDocumentLine(
                line_number=index,
                nomenclature_id=line.nomenclature_id,
                quantity=Decimal(quantity),
                price=Decimal(line.price),
                amount=amount,
            )
        )

    document.total_amount = total
    post(db, document)
    return document


def cancel_shipment(db: Session, order: Order) -> None:
    """Снимает списание, если заявку вернули из отгруженной."""

    document = (
        db.execute(
            select(StockDocument)
            .where(StockDocument.order_id == order.id)
            .where(StockDocument.document_type == StockDocumentType.SHIPMENT)
        )
        .unique()
        .scalar_one_or_none()
    )

    if document is not None:
        unpost(db, document)
