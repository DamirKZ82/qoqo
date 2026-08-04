"""Возвраты от клиентов.

Проведение возврата делает две вещи сразу: приходует товар на склад и
уменьшает долг контрагента. Если сделать только одно, разойдётся либо остаток,
либо взаиморасчёты.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.returns import Return, ReturnStatus
from app.models.stock import (
    StockDocument,
    StockDocumentLine,
    StockDocumentType,
)
from app.services import stock


def _stock_document(db: Session, document: Return) -> StockDocument:
    found = (
        db.execute(select(StockDocument).where(StockDocument.return_id == document.id))
        .unique()
        .scalar_one_or_none()
    )
    if found is not None:
        return found

    created = StockDocument(
        document_type=StockDocumentType.RETURN,
        warehouse_id=document.warehouse_id,
        return_id=document.id,
        author_id=document.author_id,
        comment=f"Возврат {document.display_number}",
    )
    db.add(created)
    db.flush()
    return created


def post(db: Session, document: Return) -> StockDocument:
    """Проводит возврат: товар на склад, долг вниз."""

    stock_document = _stock_document(db, document)
    stock_document.warehouse_id = document.warehouse_id
    stock_document.document_date = datetime.combine(
        document.return_date, datetime.min.time()
    ).replace(tzinfo=None)
    stock_document.lines.clear()
    db.flush()

    total = Decimal(0)
    for index, line in enumerate(document.lines, start=1):
        amount = (Decimal(line.quantity) * Decimal(line.price)).quantize(Decimal("0.01"))
        total += amount
        stock_document.lines.append(
            StockDocumentLine(
                line_number=index,
                nomenclature_id=line.nomenclature_id,
                quantity=Decimal(line.quantity),
                price=Decimal(line.price),
                amount=amount,
            )
        )

    stock_document.total_amount = total
    document.total_amount = total
    document.status = ReturnStatus.POSTED

    stock.post(db, stock_document)
    return stock_document


def unpost(db: Session, document: Return) -> None:
    """Отменяет проведение: товар уходит со склада, долг возвращается."""

    found = (
        db.execute(select(StockDocument).where(StockDocument.return_id == document.id))
        .unique()
        .scalar_one_or_none()
    )
    if found is not None:
        stock.unpost(db, found)

    document.status = ReturnStatus.DRAFT
