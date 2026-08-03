from datetime import date, timedelta
from decimal import Decimal

from app.services.settlements import AGING_BUCKETS, Charge, CounterpartyBalance, aging

TODAY = date(2026, 8, 4)


def charge(amount: str, due_in_days: int, paid: str = "0") -> Charge:
    return Charge(
        order_id="o1",
        display_number="ЗК-000001",
        order_date=TODAY - timedelta(days=30),
        due_date=TODAY + timedelta(days=due_in_days),
        amount=Decimal(amount),
        paid=Decimal(paid),
    )


def test_debt_is_charged_minus_paid() -> None:
    balance = CounterpartyBalance(counterparty_id="c1", charged=Decimal(1000), paid=Decimal(300))
    assert balance.debt == Decimal(700)


def test_fully_paid_charge_is_never_overdue() -> None:
    """Оплаченная отгрузка не может быть просроченной, даже если срок прошёл."""

    assert charge("1000", due_in_days=-90, paid="1000").overdue_days(TODAY) == 0


def test_overdue_days_counted_from_due_date() -> None:
    assert charge("1000", due_in_days=-5).overdue_days(TODAY) == 5
    # Срок ещё не наступил — просрочки нет, а не отрицательная.
    assert charge("1000", due_in_days=5).overdue_days(TODAY) == 0


def test_partially_paid_charge_keeps_remainder_overdue() -> None:
    item = charge("1000", due_in_days=-10, paid="400")
    assert item.outstanding == Decimal(600)
    assert item.overdue_days(TODAY) == 10


def test_aging_puts_charges_into_buckets() -> None:
    balance = CounterpartyBalance(
        counterparty_id="c1",
        charges=[
            charge("100", due_in_days=3),  # срок не наступил
            charge("200", due_in_days=-1),  # 1 день
            charge("300", due_in_days=-10),  # 10 дней
            charge("400", due_in_days=-20),  # 20 дней
            charge("500", due_in_days=-90),  # больше 30
        ],
    )

    result = aging(balance, TODAY)
    assert result["current"] == Decimal(100)
    assert result["d1_7"] == Decimal(200)
    assert result["d8_14"] == Decimal(300)
    assert result["d15_30"] == Decimal(400)
    assert result["d30_plus"] == Decimal(500)


def test_aging_ignores_paid_charges() -> None:
    balance = CounterpartyBalance(
        counterparty_id="c1",
        charges=[charge("100", due_in_days=-50, paid="100"), charge("200", due_in_days=-50)],
    )
    result = aging(balance, TODAY)
    assert sum(result.values()) == Decimal(200)


def test_aging_bucket_edges() -> None:
    """Границы корзин: ровно 7 и 14 дней попадают в младшую корзину."""

    balance = CounterpartyBalance(
        counterparty_id="c1",
        charges=[
            charge("10", due_in_days=-AGING_BUCKETS[0]),
            charge("20", due_in_days=-AGING_BUCKETS[0] - 1),
            charge("30", due_in_days=-AGING_BUCKETS[1]),
        ],
    )
    result = aging(balance, TODAY)
    assert result["d1_7"] == Decimal(10)
    assert result["d8_14"] == Decimal(50)
