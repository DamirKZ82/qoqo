import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.payment import PaymentMethod
from app.schemas.common import ORMModel


class PaymentWrite(BaseModel):
    counterparty_id: uuid.UUID
    contract_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    # Оплата конкретной заявки. Пусто — гасит долг с самого старого.
    order_id: uuid.UUID | None = None
    payment_date: date | None = None
    amount: Decimal = Field(gt=0)
    method: PaymentMethod = PaymentMethod.BANK
    comment: str | None = Field(default=None, max_length=1000)


class PaymentRead(ORMModel):
    id: uuid.UUID
    number: int
    display_number: str
    payment_date: date
    counterparty_id: uuid.UUID
    counterparty_name: str
    contract_id: uuid.UUID | None
    contract_name: str | None
    order_id: uuid.UUID | None
    amount: Decimal
    method: PaymentMethod
    method_title: str
    comment: str | None
    author_name: str | None
    created_at: datetime


class ChargeRow(BaseModel):
    """Отгрузка, породившая долг."""

    order_id: uuid.UUID
    display_number: str
    order_date: date
    due_date: date
    amount: Decimal
    paid: Decimal
    outstanding: Decimal
    overdue_days: int


class AgingBuckets(BaseModel):
    """Долг по срокам."""

    current: Decimal
    d1_7: Decimal
    d8_14: Decimal
    d15_30: Decimal
    d30_plus: Decimal


class SettlementRow(BaseModel):
    counterparty_id: uuid.UUID
    counterparty_name: str
    charged: Decimal
    paid: Decimal
    returned: Decimal
    debt: Decimal
    overdue: Decimal
    oldest_overdue_days: int
    credit_limit: Decimal
    # Сколько ещё можно отгрузить в долг. None — лимит не задан.
    credit_left: Decimal | None


class SettlementSummary(BaseModel):
    rows: list[SettlementRow]
    total_debt: Decimal
    total_overdue: Decimal


class CounterpartyStatement(BaseModel):
    """Акт сверки: чем сложился долг конкретного контрагента."""

    counterparty_id: uuid.UUID
    counterparty_name: str
    charged: Decimal
    paid: Decimal
    returned: Decimal
    debt: Decimal
    overdue: Decimal
    aging: AgingBuckets
    charges: list[ChargeRow]
    payments: list[PaymentRead]
