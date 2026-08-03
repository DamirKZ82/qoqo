import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.stock import StockDocumentStatus, StockDocumentType
from app.schemas.common import ORMModel


class StockBalanceRow(BaseModel):
    """Остаток одной позиции на складе."""

    warehouse_id: uuid.UUID
    warehouse_name: str
    nomenclature_id: uuid.UUID
    nomenclature_name: str
    nomenclature_code: str | None
    unit_name: str | None
    # Числится по документам.
    quantity: Decimal
    # Занято принятыми, но не отгруженными заявками.
    reserved: Decimal
    # Учётный минус резерв: сколько можно пообещать ещё.
    available: Decimal


class StockDocumentLineWrite(BaseModel):
    nomenclature_id: uuid.UUID
    quantity: Decimal = Field(ge=0)
    price: Decimal = Field(default=Decimal(0), ge=0)


class StockDocumentLineRead(ORMModel):
    id: uuid.UUID
    line_number: int
    nomenclature_id: uuid.UUID
    nomenclature_name: str
    unit_name: str | None
    quantity: Decimal
    price: Decimal
    amount: Decimal
    expected_quantity: Decimal | None


class StockDocumentWrite(BaseModel):
    document_type: StockDocumentType
    warehouse_id: uuid.UUID
    document_date: datetime | None = None
    comment: str | None = Field(default=None, max_length=1000)
    lines: list[StockDocumentLineWrite] = Field(default_factory=list)


class StockDocumentRead(ORMModel):
    id: uuid.UUID
    number: int
    display_number: str
    document_type: StockDocumentType
    document_type_title: str
    status: StockDocumentStatus
    document_date: datetime
    warehouse_id: uuid.UUID
    warehouse_name: str
    author_name: str | None
    order_id: uuid.UUID | None
    comment: str | None
    total_amount: Decimal
    lines_count: int
    created_at: datetime
    lines: list[StockDocumentLineRead] = Field(default_factory=list)


class ShortageRow(BaseModel):
    """Чего не хватает, чтобы собрать заявку."""

    nomenclature_id: uuid.UUID
    nomenclature_name: str
    requested: Decimal
    available: Decimal
    missing: Decimal


class OrderStockCheck(BaseModel):
    warehouse_id: uuid.UUID | None
    enough: bool
    shortages: list[ShortageRow]
