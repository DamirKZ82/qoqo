import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models import OrderStatus
from app.schemas.common import ORMModel


class OrderLineWrite(BaseModel):
    nomenclature_id: uuid.UUID
    unit_id: uuid.UUID | None = None
    quantity: Decimal = Field(gt=0)
    # Если цена не передана — подставляется из номенклатуры.
    price: Decimal | None = Field(default=None, ge=0)


class OrderLineRead(ORMModel):
    id: uuid.UUID
    line_number: int
    nomenclature_id: uuid.UUID
    nomenclature_name: str
    unit_id: uuid.UUID | None
    unit_name: str | None
    quantity: Decimal
    price: Decimal
    amount: Decimal
    quantity_shipped: Decimal | None


class OrderWrite(BaseModel):
    counterparty_id: uuid.UUID
    outlet_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    division_id: uuid.UUID | None = None
    warehouse_id: uuid.UUID | None = None
    delivery_date: date | None = None
    delivery_address: str | None = None
    comment: str | None = Field(default=None, max_length=2000)
    lines: list[OrderLineWrite] = Field(default_factory=list)


class OrderRead(ORMModel):
    id: uuid.UUID
    number: int
    display_number: str
    order_date: datetime
    delivery_date: date | None
    status: OrderStatus
    status_title: str

    counterparty_id: uuid.UUID
    counterparty_name: str
    outlet_id: uuid.UUID | None
    outlet_name: str | None
    outlet_type_name: str | None
    contract_id: uuid.UUID | None
    contract_name: str | None
    organization_id: uuid.UUID | None
    division_id: uuid.UUID | None
    warehouse_id: uuid.UUID | None
    warehouse_name: str | None
    author_id: uuid.UUID
    author_name: str

    delivery_address: str | None
    comment: str | None
    total_amount: Decimal
    lines_count: int
    created_at: datetime
    updated_at: datetime

    lines: list[OrderLineRead] = Field(default_factory=list)


class OrderStatusChange(BaseModel):
    status: OrderStatus
    comment: str | None = None


class ShippedQuantity(BaseModel):
    line_id: uuid.UUID
    quantity_shipped: Decimal = Field(ge=0)


class OrderAssembly(BaseModel):
    """Фактически собранные количества — заполняет склад."""

    lines: list[ShippedQuantity]


class OrderStats(BaseModel):
    """Сводка для дашборда."""

    draft: int = 0
    new: int = 0
    assembling: int = 0
    assembled: int = 0
    shipped: int = 0
    delivered: int = 0
    cancelled: int = 0
    total_amount_today: Decimal = Decimal(0)
    orders_today: int = 0
