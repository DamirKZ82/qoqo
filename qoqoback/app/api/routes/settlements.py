import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.models import Contract, Counterparty, UserRole
from app.models.payment import METHOD_TITLES, Payment
from app.schemas.common import Page
from app.schemas.settlement import (
    AgingBuckets,
    ChargeRow,
    CounterpartyStatement,
    PaymentRead,
    PaymentWrite,
    SettlementRow,
    SettlementSummary,
)
from app.services import settlements

router = APIRouter(prefix="/settlements", tags=["Взаиморасчёты"])

# Деньги ведут бухгалтер, директор и администратор.
MONEY_ROLES = (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.ACCOUNTANT)


def _require_money_role(user: Any) -> None:
    if user.role not in MONEY_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Взаиморасчёты ведут бухгалтер, директор и администратор",
        )


def serialize_payment(payment: Payment) -> dict[str, Any]:
    return {
        "id": payment.id,
        "number": payment.number,
        "display_number": payment.display_number,
        "payment_date": payment.payment_date,
        "counterparty_id": payment.counterparty_id,
        "counterparty_name": payment.counterparty.name if payment.counterparty else "",
        "contract_id": payment.contract_id,
        "contract_name": payment.contract.name if payment.contract else None,
        "order_id": payment.order_id,
        "amount": payment.amount,
        "method": payment.method,
        "method_title": METHOD_TITLES.get(payment.method, payment.method.value),
        "comment": payment.comment,
        "author_name": payment.author.full_name if payment.author else None,
        "created_at": payment.created_at,
    }


@router.get("", response_model=SettlementSummary)
def settlement_summary(
    db: DbSession,
    user: CurrentUser,
    only_debtors: bool = True,
    only_overdue: bool = False,
) -> SettlementSummary:
    """Долги по всем контрагентам."""

    _require_money_role(user)
    today = datetime.now(UTC).date()
    balances = settlements.collect(db, today=today)

    names = {row.id: row.name for row in db.execute(select(Counterparty)).unique().scalars()}
    # Лимит берём максимальный по договорам контрагента: договоров может быть
    # несколько, и запрещать по самому строгому было бы неожиданно.
    limits = {
        row[0]: Decimal(row[1] or 0)
        for row in db.execute(
            select(Contract.counterparty_id, func.max(Contract.credit_limit)).group_by(
                Contract.counterparty_id
            )
        ).all()
    }

    rows: list[SettlementRow] = []
    for party, balance in balances.items():
        if only_debtors and balance.debt <= 0:
            continue
        if only_overdue and balance.overdue <= 0:
            continue

        limit = limits.get(party, Decimal(0))
        rows.append(
            SettlementRow(
                counterparty_id=party,
                counterparty_name=names.get(party, "—"),
                charged=balance.charged,
                paid=balance.paid,
                debt=balance.debt,
                overdue=balance.overdue,
                oldest_overdue_days=balance.oldest_overdue_days,
                credit_limit=limit,
                credit_left=(limit - balance.debt) if limit > 0 else None,
            )
        )

    rows.sort(key=lambda row: row.debt, reverse=True)

    return SettlementSummary(
        rows=rows,
        total_debt=sum((row.debt for row in rows), Decimal(0)),
        total_overdue=sum((row.overdue for row in rows), Decimal(0)),
    )


@router.get("/counterparties/{counterparty_id}", response_model=CounterpartyStatement)
def counterparty_statement(
    counterparty_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> CounterpartyStatement:
    """Акт сверки: из чего сложился долг."""

    _require_money_role(user)
    today = datetime.now(UTC).date()

    counterparty = db.get(Counterparty, counterparty_id)
    if counterparty is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Контрагент не найден")

    balances = settlements.collect(db, counterparty_id, today=today)
    balance = balances.get(counterparty_id) or settlements.CounterpartyBalance(
        counterparty_id=counterparty_id
    )

    payments = (
        db.execute(
            select(Payment)
            .where(Payment.counterparty_id == counterparty_id)
            .order_by(Payment.payment_date.desc(), Payment.number.desc())
        )
        .unique()
        .scalars()
        .all()
    )

    return CounterpartyStatement(
        counterparty_id=counterparty_id,
        counterparty_name=counterparty.name,
        charged=balance.charged,
        paid=balance.paid,
        debt=balance.debt,
        overdue=balance.overdue,
        aging=AgingBuckets(**settlements.aging(balance, today)),
        charges=[
            ChargeRow(
                order_id=charge.order_id,
                display_number=charge.display_number,
                order_date=charge.order_date,
                due_date=charge.due_date,
                amount=charge.amount,
                paid=charge.paid,
                outstanding=charge.outstanding,
                overdue_days=charge.overdue_days(today),
            )
            for charge in balance.charges
        ],
        payments=[PaymentRead.model_validate(serialize_payment(row)) for row in payments],
    )


# --- Оплаты --------------------------------------------------------------


@router.get("/payments", response_model=Page[PaymentRead])
def list_payments(
    db: DbSession,
    user: CurrentUser,
    counterparty_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Any:
    _require_money_role(user)

    stmt = select(Payment)
    if counterparty_id is not None:
        stmt = stmt.where(Payment.counterparty_id == counterparty_id)
    if date_from is not None:
        stmt = stmt.where(Payment.payment_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Payment.payment_date <= date_to)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(
            stmt.order_by(Payment.payment_date.desc(), Payment.number.desc())
            .limit(limit)
            .offset(offset)
        )
        .unique()
        .scalars()
        .all()
    )

    return Page(
        items=[serialize_payment(row) for row in rows], total=total, limit=limit, offset=offset
    )


@router.post("/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
def create_payment(payload: PaymentWrite, db: DbSession, user: CurrentUser) -> Any:
    _require_money_role(user)

    payment = Payment(
        counterparty_id=payload.counterparty_id,
        contract_id=payload.contract_id,
        organization_id=payload.organization_id,
        order_id=payload.order_id,
        payment_date=payload.payment_date or datetime.now(UTC).date(),
        amount=payload.amount,
        method=payload.method,
        comment=payload.comment,
        author_id=user.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return serialize_payment(payment)


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    _require_money_role(user)

    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Оплата не найдена")

    db.delete(payment)
    db.commit()
