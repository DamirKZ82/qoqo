import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel


class PeriodGroup(StrEnum):
    """Шаг, с которым продажи раскладываются по времени."""

    DAY = "day"
    WEEK = "week"
    MONTH = "month"


PERIOD_TITLES: dict[PeriodGroup, str] = {
    PeriodGroup.DAY: "По дням",
    PeriodGroup.WEEK: "По неделям",
    PeriodGroup.MONTH: "По месяцам",
}


class Dimension(StrEnum):
    """Разрез, в котором показываем продажи."""

    OUTLET = "outlet"
    COUNTERPARTY = "counterparty"
    SALES_REP = "sales_rep"
    NOMENCLATURE = "nomenclature"
    CATEGORY = "category"
    WAREHOUSE = "warehouse"


DIMENSION_TITLES: dict[Dimension, str] = {
    Dimension.OUTLET: "Торговые точки",
    Dimension.COUNTERPARTY: "Контрагенты",
    Dimension.SALES_REP: "Торговые представители",
    Dimension.NOMENCLATURE: "Номенклатура",
    Dimension.CATEGORY: "Номенклатурные группы",
    Dimension.WAREHOUSE: "Склады",
}


class ReportTotals(BaseModel):
    """Итоги за период."""

    orders_count: int = 0
    total_amount: Decimal = Decimal(0)
    average_check: Decimal = Decimal(0)
    positions_count: int = 0
    quantity: Decimal = Decimal(0)
    outlets_count: int = 0


class SalesPoint(BaseModel):
    """Одна точка на графике динамики."""

    period: date
    # Короткая подпись для оси и полная — для подсказки.
    label: str
    title: str
    orders_count: int = 0
    total_amount: Decimal = Decimal(0)


class SalesReport(BaseModel):
    date_from: date
    date_to: date
    group_by: PeriodGroup
    totals: ReportTotals
    # Такой же по длине период, идущий сразу перед выбранным, — для сравнения.
    previous: ReportTotals
    previous_from: date
    previous_to: date
    series: list[SalesPoint]


class BreakdownRow(BaseModel):
    # Пусто, когда в заявке не заполнен элемент разреза (например, склад).
    id: uuid.UUID | None = None
    name: str
    orders_count: int = 0
    quantity: Decimal = Decimal(0)
    total_amount: Decimal = Decimal(0)
    # Доля в сумме за период, 0..1.
    share: float = 0.0


class BreakdownReport(BaseModel):
    dimension: Dimension
    dimension_title: str
    date_from: date
    date_to: date
    total_amount: Decimal
    # Сумма по строкам ниже: при limit хвост в них не попадает.
    shown_amount: Decimal
    rows: list[BreakdownRow]
