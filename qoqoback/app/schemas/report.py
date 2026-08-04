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


class ExportLanguage(StrEnum):
    """Язык выгрузки. В интерфейсе подписи собирает клиент, но CSV пишет сервер."""

    RU = "ru"
    KK = "kk"


DIMENSION_TITLES_KK: dict[Dimension, str] = {
    Dimension.OUTLET: "Сауда нүктелері",
    Dimension.COUNTERPARTY: "Контрагенттер",
    Dimension.SALES_REP: "Сауда өкілдері",
    Dimension.NOMENCLATURE: "Номенклатура",
    Dimension.CATEGORY: "Номенклатура топтары",
    Dimension.WAREHOUSE: "Қоймалар",
}

# Заголовки колонок выгрузки: разрез, заявок, количество, сумма, доля.
CSV_HEADERS: dict[ExportLanguage, tuple[str, str, str, str]] = {
    ExportLanguage.RU: ("Заявок", "Количество", "Сумма", "Доля, %"),
    ExportLanguage.KK: ("Өтінімдер", "Саны", "Сома", "Үлесі, %"),
}

CSV_TOTAL: dict[ExportLanguage, str] = {
    ExportLanguage.RU: "Итого",
    ExportLanguage.KK: "Жиыны",
}


def dimension_title(dimension: Dimension, language: ExportLanguage) -> str:
    if language is ExportLanguage.KK:
        return DIMENSION_TITLES_KK[dimension]
    return DIMENSION_TITLES[dimension]


class ReportTotals(BaseModel):
    """Итоги за период."""

    orders_count: int = 0
    total_amount: Decimal = Decimal(0)
    average_check: Decimal = Decimal(0)
    positions_count: int = 0
    quantity: Decimal = Decimal(0)
    outlets_count: int = 0


class SalesPoint(BaseModel):
    """Одна точка на графике динамики.

    Отдаём только начало периода: подпись собирает клиент средствами Intl на
    выбранном языке, поэтому названия месяцев на сервере не нужны.
    """

    period: date
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


# --- Топ продаж ----------------------------------------------------------


class TopRow(BaseModel):
    """Строка топа: показатель за период и его изменение к прошлому."""

    id: uuid.UUID | None
    name: str
    orders_count: int
    quantity: Decimal
    total_amount: Decimal
    share: float
    previous_amount: Decimal
    # Прирост к прошлому периоду в долях. None — в прошлом периоде продаж не
    # было, и процент роста посчитать не от чего.
    change: float | None


class TopReport(BaseModel):
    date_from: date
    date_to: date
    previous_from: date
    previous_to: date
    dimension: Dimension
    dimension_title: str
    rows: list[TopRow]


# --- Оборачиваемость -----------------------------------------------------


class TurnoverRow(BaseModel):
    """Как часто торговая точка заказывает."""

    id: uuid.UUID | None
    name: str
    outlet_type: str | None
    orders_count: int
    total_amount: Decimal
    average_check: Decimal
    first_order: date | None
    last_order: date | None
    # Среднее число дней между заявками. None — заявка была одна, интервала нет.
    average_interval_days: float | None
    days_since_last: int | None
    status: str


class TurnoverReport(BaseModel):
    date_from: date
    date_to: date
    rows: list[TurnoverRow]
    # Порог в днях, по которому точка считается уснувшей.
    sleeping_after_days: int


# --- Оборачиваемость запасов ---------------------------------------------


class StockTurnoverRow(BaseModel):
    """Как быстро расходится позиция на складе."""

    warehouse_id: uuid.UUID
    warehouse_name: str
    nomenclature_id: uuid.UUID
    nomenclature_name: str
    unit_name: str | None
    opening: Decimal
    closing: Decimal
    average: Decimal
    # Сколько ушло со склада за период: отгрузки, списания, недостачи.
    consumed: Decimal
    received: Decimal
    # Расход, делённый на средний остаток. None — на складе ничего не лежало.
    turnover_ratio: float | None
    # За сколько дней распродаётся средний запас. None — расхода не было.
    days_to_sell: float | None
    # На сколько дней хватит текущего остатка при том же темпе.
    days_of_supply: float | None
    last_movement: date | None
    days_without_movement: int | None


class StockTurnoverReport(BaseModel):
    date_from: date
    date_to: date
    days: int
    rows: list[StockTurnoverRow]
    # Порог, после которого товар считается залежавшимся.
    stale_after_days: int


# --- Сводка руководителя -------------------------------------------------


class DashboardPeriod(BaseModel):
    label: str
    orders_count: int
    total_amount: Decimal
    change: float | None


class DashboardAlert(BaseModel):
    """Что требует внимания прямо сейчас."""

    kind: str
    title: str
    count: int
    amount: Decimal | None = None


class DirectorDashboard(BaseModel):
    periods: list[DashboardPeriod]
    debt: Decimal
    overdue: Decimal
    overdue_counterparties: int
    orders_to_process: int
    out_of_stock: int
    stale_items: int
    visits_planned: int
    visits_done: int
    alerts: list[DashboardAlert]
