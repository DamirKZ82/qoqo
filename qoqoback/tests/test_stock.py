from decimal import Decimal

import pytest

from app.models import OrderStatus
from app.models.stock import DOCUMENT_PREFIXES, DOCUMENT_SIGNS, StockDocumentType
from app.services import stock


class FakeLine:
    def __init__(self, nomenclature_id: str, quantity: str, shipped: str | None = None) -> None:
        self.nomenclature_id = nomenclature_id
        self.quantity = Decimal(quantity)
        self.quantity_shipped = Decimal(shipped) if shipped is not None else None
        self.nomenclature = type("N", (), {"name": f"Товар {nomenclature_id}"})()


class FakeOrder:
    def __init__(
        self,
        warehouse_id: str | None,
        lines: list[FakeLine],
        status: object = OrderStatus.NEW,
    ) -> None:
        self.warehouse_id = warehouse_id
        self.lines = lines
        self.status = status


def test_signs_cover_movement_documents() -> None:
    # У инвентаризации знака нет: движение считается как разница с остатком.
    assert DOCUMENT_SIGNS[StockDocumentType.RECEIPT] == 1
    assert DOCUMENT_SIGNS[StockDocumentType.WRITEOFF] == -1
    assert DOCUMENT_SIGNS[StockDocumentType.SHIPMENT] == -1
    assert StockDocumentType.INVENTORY not in DOCUMENT_SIGNS


def test_every_type_has_prefix() -> None:
    assert set(DOCUMENT_PREFIXES) == set(StockDocumentType)


def test_order_without_warehouse_is_not_checked() -> None:
    # Склад не указан — проверять нечего, и заявка не должна блокироваться.
    assert stock.shortages(None, FakeOrder(None, [FakeLine("a", "5")])) == []


@pytest.mark.parametrize(
    ("on_hand", "reserved_total", "requested", "expected_missing"),
    [
        # Товара хватает с запасом.
        ("100", "10", "5", None),
        # Ровно столько, сколько нужно.
        ("10", "10", "10", None),
        # Часть занята другой заявкой.
        ("10", "12", "10", "2"),
        # Товара нет вовсе.
        ("0", "5", "5", "5"),
    ],
)
def test_shortage_accounts_for_other_reservations(
    monkeypatch: pytest.MonkeyPatch,
    on_hand: str,
    reserved_total: str,
    requested: str,
    expected_missing: str | None,
) -> None:
    """Резерв самой заявки не должен считаться нехваткой.

    В reserved попадает и текущая заявка, поэтому её количество возвращается
    обратно — иначе любая принятая заявка выглядела бы необеспеченной.
    """

    warehouse, product = "w1", "p1"
    monkeypatch.setattr(stock, "balances", lambda db, wid: {(warehouse, product): Decimal(on_hand)})
    monkeypatch.setattr(
        stock, "reserved", lambda db, wid: {(warehouse, product): Decimal(reserved_total)}
    )

    order = FakeOrder(warehouse, [FakeLine(product, requested)])
    result = stock.shortages(None, order)

    if expected_missing is None:
        assert result == []
    else:
        assert len(result) == 1
        assert result[0][1] == Decimal(expected_missing)


def test_shortage_lists_only_missing_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    warehouse = "w1"
    monkeypatch.setattr(
        stock,
        "balances",
        lambda db, wid: {(warehouse, "p1"): Decimal(100), (warehouse, "p2"): Decimal(1)},
    )
    monkeypatch.setattr(stock, "reserved", lambda db, wid: {})

    # Черновик в резерв ещё не попал, поэтому своё количество не возвращается.
    order = FakeOrder(
        warehouse, [FakeLine("p1", "10"), FakeLine("p2", "10")], status=OrderStatus.DRAFT
    )
    result = stock.shortages(None, order)

    assert [line.nomenclature_id for line, _ in result] == ["p2"]
    assert result[0][1] == Decimal(9)


def test_reserving_statuses_exclude_shipped_and_draft() -> None:
    """Черновик ещё ничего не занял, отгруженное уже списано движением."""

    values = {status.value for status in stock.RESERVING_STATUSES}
    assert values == {"new", "assembling", "assembled"}


def test_draft_does_not_credit_its_own_quantity(monkeypatch: pytest.MonkeyPatch) -> None:
    """Черновик не занимает товар, поэтому и вычитать его из резерва нельзя.

    Иначе пустой склад показывал бы, что заявку можно собрать.
    """

    warehouse, product = "w1", "p1"
    monkeypatch.setattr(stock, "balances", lambda db, wid: {})
    monkeypatch.setattr(stock, "reserved", lambda db, wid: {})

    order = FakeOrder(warehouse, [FakeLine(product, "7")], status=OrderStatus.DRAFT)
    result = stock.shortages(None, order)

    assert len(result) == 1
    assert result[0][1] == Decimal(7)
