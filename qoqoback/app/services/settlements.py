"""Взаиморасчёты: долги контрагентов, просрочка и кредитный лимит.

Долг не хранится числом: он считается как отгруженное минус оплаченное. Так он
не может разойтись с документами, а любую цифру всегда можно разложить на
породившие её заявки и оплаты.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Contract, Order, OrderStatus
from app.models.payment import Payment

# Долг возникает по отгруженным заявкам: пока товар не уехал, платить не за что.
CHARGING_STATUSES = (OrderStatus.SHIPPED, OrderStatus.DELIVERED)

# Границы «корзин» просрочки в днях.
AGING_BUCKETS = (7, 14, 30)


@dataclass(slots=True)
class Charge:
    """Отгрузка, породившая долг."""

    order_id: uuid.UUID
    display_number: str
    order_date: date
    due_date: date
    amount: Decimal
    paid: Decimal = Decimal(0)

    @property
    def outstanding(self) -> Decimal:
        return self.amount - self.paid

    def overdue_days(self, today: date) -> int:
        return max((today - self.due_date).days, 0) if self.outstanding > 0 else 0


@dataclass(slots=True)
class CounterpartyBalance:
    counterparty_id: uuid.UUID
    charged: Decimal = Decimal(0)
    paid: Decimal = Decimal(0)
    overdue: Decimal = Decimal(0)
    oldest_overdue_days: int = 0
    charges: list[Charge] = field(default_factory=list)

    @property
    def debt(self) -> Decimal:
        return self.charged - self.paid


def _due_date(order_date: date, payment_days: int) -> date:
    return order_date + timedelta(days=payment_days)


def collect(
    db: Session,
    counterparty_id: uuid.UUID | None = None,
    *,
    today: date | None = None,
) -> dict[uuid.UUID, CounterpartyBalance]:
    """Считает долги по контрагентам с разнесением оплат.

    Общие оплаты гасят долг с самого старого — так же, как это делает
    бухгалтер: иначе просрочка висела бы на давно оплаченной отгрузке.
    """

    today = today or datetime.now(UTC).date()

    # Отсрочка платежа берётся из договора; без договора считаем оплату по факту.
    payment_days = {
        row[0]: int(row[1] or 0)
        for row in db.execute(select(Contract.id, Contract.payment_days)).all()
    }

    charges_stmt = (
        select(
            Order.counterparty_id,
            Order.id,
            Order.number,
            Order.contract_id,
            func.date(Order.order_date),
            Order.total_amount,
        )
        .where(Order.status.in_(CHARGING_STATUSES))
        .order_by(Order.order_date, Order.number)
    )
    if counterparty_id is not None:
        charges_stmt = charges_stmt.where(Order.counterparty_id == counterparty_id)

    balances: dict[uuid.UUID, CounterpartyBalance] = {}

    for row in db.execute(charges_stmt).all():
        party, order_id, number, contract_id, order_date, amount = row
        balance = balances.setdefault(party, CounterpartyBalance(counterparty_id=party))
        days = payment_days.get(contract_id, 0)
        charge = Charge(
            order_id=order_id,
            display_number=f"ЗК-{number:06d}",
            order_date=order_date,
            due_date=_due_date(order_date, days),
            amount=Decimal(amount),
        )
        balance.charges.append(charge)
        balance.charged += charge.amount

    payments_stmt = select(Payment.counterparty_id, Payment.order_id, Payment.amount)
    if counterparty_id is not None:
        payments_stmt = payments_stmt.where(Payment.counterparty_id == counterparty_id)

    targeted: dict[uuid.UUID, Decimal] = {}
    free: dict[uuid.UUID, Decimal] = {}

    for party, order_id, amount in db.execute(payments_stmt).all():
        balance = balances.setdefault(party, CounterpartyBalance(counterparty_id=party))
        balance.paid += Decimal(amount)
        if order_id is not None:
            targeted[order_id] = targeted.get(order_id, Decimal(0)) + Decimal(amount)
        else:
            free[party] = free.get(party, Decimal(0)) + Decimal(amount)

    for balance in balances.values():
        # Сначала оплаты, привязанные к своей заявке.
        for charge in balance.charges:
            charge.paid = min(targeted.get(charge.order_id, Decimal(0)), charge.amount)

        # Остальное разносим от старых к новым.
        remainder = free.get(balance.counterparty_id, Decimal(0))
        for charge in balance.charges:
            if remainder <= 0:
                break
            applied = min(charge.outstanding, remainder)
            charge.paid += applied
            remainder -= applied

        for charge in balance.charges:
            days = charge.overdue_days(today)
            if days > 0:
                balance.overdue += charge.outstanding
                balance.oldest_overdue_days = max(balance.oldest_overdue_days, days)

    return balances


def aging(balance: CounterpartyBalance, today: date) -> dict[str, Decimal]:
    """Разбивка долга по срокам: текущий и корзины просрочки."""

    result = {
        "current": Decimal(0),
        "d1_7": Decimal(0),
        "d8_14": Decimal(0),
        "d15_30": Decimal(0),
        "d30_plus": Decimal(0),
    }

    for charge in balance.charges:
        if charge.outstanding <= 0:
            continue
        days = charge.overdue_days(today)
        if days == 0:
            result["current"] += charge.outstanding
        elif days <= AGING_BUCKETS[0]:
            result["d1_7"] += charge.outstanding
        elif days <= AGING_BUCKETS[1]:
            result["d8_14"] += charge.outstanding
        elif days <= AGING_BUCKETS[2]:
            result["d15_30"] += charge.outstanding
        else:
            result["d30_plus"] += charge.outstanding

    return result


def credit_limit_exceeded(db: Session, order: Order) -> tuple[bool, Decimal, Decimal]:
    """Выйдет ли заявка за кредитный лимит договора.

    Возвращает признак и пару «текущий долг, лимит». Нулевой лимит означает,
    что ограничения нет: так проще, чем заводить отдельный флаг.
    """

    if order.contract_id is None:
        return False, Decimal(0), Decimal(0)

    contract = db.get(Contract, order.contract_id)
    limit = Decimal(contract.credit_limit) if contract else Decimal(0)
    if limit <= 0:
        return False, Decimal(0), limit

    balances = collect(db, order.counterparty_id)
    debt = balances[order.counterparty_id].debt if order.counterparty_id in balances else Decimal(0)

    return debt + Decimal(order.total_amount) > limit, debt, limit
