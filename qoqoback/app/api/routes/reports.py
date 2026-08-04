import csv
import io
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.core.deps import DbSession, require_roles
from app.models import (
    VISITED_RESULTS,
    Counterparty,
    Nomenclature,
    Order,
    OrderLine,
    OrderStatus,
    Outlet,
    OutletType,
    ProductCategory,
    StockMovement,
    User,
    UserRole,
    Visit,
    Warehouse,
)
from app.schemas.report import (
    CSV_HEADERS,
    CSV_TOTAL,
    DIMENSION_TITLES,
    BreakdownReport,
    BreakdownRow,
    DashboardAlert,
    DashboardPeriod,
    Dimension,
    DirectorDashboard,
    ExportLanguage,
    PeriodGroup,
    ReportTotals,
    SalesPoint,
    SalesReport,
    StockTurnoverReport,
    StockTurnoverRow,
    TopReport,
    TopRow,
    TurnoverReport,
    TurnoverRow,
    dimension_title,
)
from app.services import settlements
from app.services import stock as stock_service
from app.services.orders import visible_orders_conditions

router = APIRouter(prefix="/reports", tags=["Отчёты"])

# Склад в отчёты не ходит: суммы продаж — не его задача. Торговый представитель
# отчёты видит, но только по своим заявкам — это обеспечивает фильтр видимости.
REPORT_ROLES: tuple[UserRole, ...] = (
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.ACCOUNTANT,
    UserRole.SALES_REP,
)

ReportUser = Annotated[User, Depends(require_roles(*REPORT_ROLES))]

# Продажами считаем заявки, запущенные в работу: черновик ещё не отправлен,
# отменённая заявка продажей не стала.
COUNTED_STATUSES: tuple[OrderStatus, ...] = tuple(
    item for item in OrderStatus if item not in (OrderStatus.DRAFT, OrderStatus.CANCELLED)
)

MAX_PERIOD_DAYS = 1095


# --- Параметры отчёта ----------------------------------------------------


@dataclass(slots=True)
class ReportQuery:
    """Разобранные и проверенные параметры периода и фильтров."""

    date_from: date
    date_to: date
    warehouse_id: uuid.UUID | None
    outlet_id: uuid.UUID | None
    counterparty_id: uuid.UUID | None
    author_id: uuid.UUID | None
    # Товарные фильтры действуют на уровне строк заявки, а не заявки целиком:
    # «продажи филе» — это суммы по строкам с филе, а не по заявкам, где оно есть.
    nomenclature_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None

    @property
    def days(self) -> int:
        return (self.date_to - self.date_from).days + 1

    @property
    def previous(self) -> "ReportQuery":
        """Такой же по длине период, идущий сразу перед этим."""

        end = self.date_from - timedelta(days=1)
        return ReportQuery(
            date_from=end - timedelta(days=self.days - 1),
            date_to=end,
            warehouse_id=self.warehouse_id,
            outlet_id=self.outlet_id,
            counterparty_id=self.counterparty_id,
            author_id=self.author_id,
            nomenclature_id=self.nomenclature_id,
            category_id=self.category_id,
        )


def report_query(
    date_from: date | None = Query(
        default=None, description="Начало периода, по умолчанию — 29 дней назад"
    ),
    date_to: date | None = Query(default=None, description="Конец периода, по умолчанию — сегодня"),
    warehouse_id: uuid.UUID | None = None,
    outlet_id: uuid.UUID | None = None,
    counterparty_id: uuid.UUID | None = None,
    author_id: uuid.UUID | None = None,
    nomenclature_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
) -> ReportQuery:
    today = datetime.now(UTC).date()
    end = date_to or today
    start = date_from or end - timedelta(days=29)

    if start > end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Начало периода позже его конца",
        )
    if (end - start).days + 1 > MAX_PERIOD_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Период не может быть длиннее {MAX_PERIOD_DAYS} дней",
        )

    return ReportQuery(
        date_from=start,
        date_to=end,
        warehouse_id=warehouse_id,
        outlet_id=outlet_id,
        counterparty_id=counterparty_id,
        author_id=author_id,
        nomenclature_id=nomenclature_id,
        category_id=category_id,
    )


ReportParams = Annotated[ReportQuery, Depends(report_query)]


def _conditions(user: User, params: ReportQuery) -> list[ColumnElement[bool]]:
    conditions = visible_orders_conditions(user)
    conditions.append(Order.status.in_(COUNTED_STATUSES))
    conditions.append(func.date(Order.order_date) >= params.date_from)
    conditions.append(func.date(Order.order_date) <= params.date_to)

    if params.warehouse_id is not None:
        conditions.append(Order.warehouse_id == params.warehouse_id)
    if params.outlet_id is not None:
        conditions.append(Order.outlet_id == params.outlet_id)
    if params.counterparty_id is not None:
        conditions.append(Order.counterparty_id == params.counterparty_id)
    if params.author_id is not None:
        conditions.append(Order.author_id == params.author_id)

    return conditions


def _line_conditions(params: ReportQuery) -> list[ColumnElement[bool]]:
    """Условия, которые применимы только там, где присоединены строки заявки."""

    conditions: list[ColumnElement[bool]] = []
    if params.nomenclature_id is not None:
        conditions.append(OrderLine.nomenclature_id == params.nomenclature_id)
    if params.category_id is not None:
        conditions.append(
            OrderLine.nomenclature_id.in_(
                select(Nomenclature.id).where(Nomenclature.category_id == params.category_id)
            )
        )
    return conditions


# --- Периоды -------------------------------------------------------------


def _bucket_start(group: PeriodGroup, value: date) -> date:
    if group is PeriodGroup.DAY:
        return value
    if group is PeriodGroup.WEEK:
        # Неделя с понедельника — так же, как date_trunc('week') в PostgreSQL.
        return value - timedelta(days=value.weekday())
    return value.replace(day=1)


def _next_bucket(group: PeriodGroup, value: date) -> date:
    if group is PeriodGroup.DAY:
        return value + timedelta(days=1)
    if group is PeriodGroup.WEEK:
        return value + timedelta(days=7)
    return (value.replace(day=28) + timedelta(days=4)).replace(day=1)


def _bucket_starts(group: PeriodGroup, params: ReportQuery) -> list[date]:
    """Все периоды внутри диапазона, включая те, где заявок не было.

    Без них на графике получились бы разрывы, а провал в продажах читался бы
    как отсутствие данных.
    """

    starts: list[date] = []
    current = _bucket_start(group, params.date_from)
    while current <= params.date_to:
        starts.append(current)
        current = _next_bucket(group, current)
    return starts


# --- Итоги ---------------------------------------------------------------


def _totals(
    db: Session,
    conditions: list[ColumnElement[bool]],
    line_conditions: list[ColumnElement[bool]] | None = None,
) -> ReportTotals:
    # Всё считаем по строкам заявок: сумма заявки равна сумме её строк, зато
    # товарные фильтры сужают и итоги, а не только разрезы.
    row = db.execute(
        select(
            func.count(func.distinct(Order.id)),
            func.coalesce(func.sum(OrderLine.amount), 0),
            func.count(func.distinct(Order.outlet_id)),
            func.count(OrderLine.id),
            func.coalesce(
                func.sum(func.coalesce(OrderLine.quantity_shipped, OrderLine.quantity)), 0
            ),
        )
        .select_from(Order)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .where(*conditions, *(line_conditions or []))
    ).one()

    orders_row = (row[0], row[1], row[2])
    lines_row = (row[3], row[4])

    orders_count = int(orders_row[0])
    total_amount = Decimal(orders_row[1])
    average = (
        (total_amount / orders_count).quantize(Decimal("0.01")) if orders_count else Decimal(0)
    )

    return ReportTotals(
        orders_count=orders_count,
        total_amount=total_amount,
        average_check=average,
        positions_count=int(lines_row[0]),
        quantity=Decimal(lines_row[1]),
        outlets_count=int(orders_row[2]),
    )


@router.get("/sales", response_model=SalesReport)
def sales_report(
    db: DbSession,
    user: ReportUser,
    params: ReportParams,
    group_by: PeriodGroup = PeriodGroup.DAY,
) -> SalesReport:
    """Продажи за период: итоги, сравнение с прошлым периодом и динамика."""

    conditions = _conditions(user, params)
    line_conditions = _line_conditions(params)
    previous_params = params.previous

    bucket = func.date_trunc(group_by.value, Order.order_date)
    rows = db.execute(
        select(
            bucket.label("bucket"),
            func.count(func.distinct(Order.id)),
            func.coalesce(func.sum(OrderLine.amount), 0),
        )
        .select_from(Order)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .where(*conditions, *line_conditions)
        .group_by(bucket)
    ).all()

    by_start: dict[date, tuple[int, Decimal]] = {}
    for bucket_value, count, amount in rows:
        start = bucket_value.date() if isinstance(bucket_value, datetime) else bucket_value
        by_start[start] = (int(count), Decimal(amount))

    series: list[SalesPoint] = []
    for start in _bucket_starts(group_by, params):
        count, amount = by_start.get(start, (0, Decimal(0)))
        series.append(SalesPoint(period=start, orders_count=count, total_amount=amount))

    return SalesReport(
        date_from=params.date_from,
        date_to=params.date_to,
        group_by=group_by,
        totals=_totals(db, conditions, line_conditions),
        previous=_totals(db, _conditions(user, previous_params), line_conditions),
        previous_from=previous_params.date_from,
        previous_to=previous_params.date_to,
        series=series,
    )


# --- Разрезы -------------------------------------------------------------

# Для каждого разреза: чем группируем, откуда берём название, чем подписываем
# строки с незаполненным значением и какие таблицы для этого присоединить.
_DIMENSIONS: dict[Dimension, tuple[Any, Any, str, tuple[tuple[Any, Any, bool], ...]]] = {
    Dimension.OUTLET: (
        Order.outlet_id,
        Outlet.name,
        "Без торговой точки",
        ((Outlet, Outlet.id == Order.outlet_id, True),),
    ),
    Dimension.COUNTERPARTY: (
        Order.counterparty_id,
        Counterparty.name,
        "Без контрагента",
        ((Counterparty, Counterparty.id == Order.counterparty_id, True),),
    ),
    Dimension.SALES_REP: (
        Order.author_id,
        User.full_name,
        "Автор удалён",
        ((User, User.id == Order.author_id, True),),
    ),
    Dimension.WAREHOUSE: (
        Order.warehouse_id,
        Warehouse.name,
        "Склад не указан",
        ((Warehouse, Warehouse.id == Order.warehouse_id, True),),
    ),
    Dimension.NOMENCLATURE: (
        OrderLine.nomenclature_id,
        Nomenclature.name,
        "Без номенклатуры",
        ((Nomenclature, Nomenclature.id == OrderLine.nomenclature_id, True),),
    ),
    Dimension.CATEGORY: (
        Nomenclature.category_id,
        ProductCategory.name,
        "Без группы",
        (
            (Nomenclature, Nomenclature.id == OrderLine.nomenclature_id, True),
            (ProductCategory, ProductCategory.id == Nomenclature.category_id, True),
        ),
    ),
}


def _breakdown_rows(
    db: Session,
    conditions: list[ColumnElement[bool]],
    dimension: Dimension,
    limit: int | None,
    line_conditions: list[ColumnElement[bool]] | None = None,
) -> tuple[list[BreakdownRow], Decimal, Decimal]:
    """Строки разреза, общая сумма по всем группам и сумма показанных строк."""

    key, name, fallback, joins = _DIMENSIONS[dimension]

    # Суммы считаем по строкам заявок: так один и тот же запрос даёт и деньги,
    # и количество, независимо от того, разрез по заявке или по номенклатуре.
    amount = func.coalesce(func.sum(OrderLine.amount), 0).label("amount")
    quantity = func.coalesce(
        func.sum(func.coalesce(OrderLine.quantity_shipped, OrderLine.quantity)), 0
    ).label("quantity")
    orders_count = func.count(func.distinct(Order.id)).label("orders_count")

    stmt = (
        select(key, name, orders_count, quantity, amount)
        .select_from(Order)
        .join(OrderLine, OrderLine.order_id == Order.id)
    )
    for entity, onclause, is_outer in joins:
        stmt = stmt.join(entity, onclause, isouter=is_outer)

    stmt = (
        stmt.where(*conditions, *(line_conditions or []))
        .group_by(key, name)
        .order_by(amount.desc())
    )

    rows = db.execute(stmt).all()
    total = sum((Decimal(row.amount) for row in rows), Decimal(0))
    visible = rows[:limit] if limit else rows
    shown = sum((Decimal(row.amount) for row in visible), Decimal(0))

    result = [
        BreakdownRow(
            id=row[0],
            name=row[1] or fallback,
            orders_count=int(row.orders_count),
            quantity=Decimal(row.quantity),
            total_amount=Decimal(row.amount),
            share=float(Decimal(row.amount) / total) if total else 0.0,
        )
        for row in visible
    ]
    return result, total, shown


@router.get("/breakdown", response_model=BreakdownReport)
def breakdown_report(
    db: DbSession,
    user: ReportUser,
    params: ReportParams,
    dimension: Dimension = Dimension.OUTLET,
    limit: int = Query(default=20, ge=1, le=200),
) -> BreakdownReport:
    """Продажи за период в выбранном разрезе, от большей суммы к меньшей."""

    rows, total, shown = _breakdown_rows(
        db, _conditions(user, params), dimension, limit, _line_conditions(params)
    )

    return BreakdownReport(
        dimension=dimension,
        dimension_title=DIMENSION_TITLES[dimension],
        date_from=params.date_from,
        date_to=params.date_to,
        total_amount=total,
        shown_amount=shown,
        rows=rows,
    )


@router.get("/breakdown/export")
def export_breakdown(
    db: DbSession,
    user: ReportUser,
    params: ReportParams,
    dimension: Dimension = Dimension.OUTLET,
    lang: ExportLanguage = ExportLanguage.RU,
) -> Response:
    """Тот же разрез целиком, файлом CSV."""

    rows, total, _ = _breakdown_rows(
        db,
        _conditions(user, params),
        dimension,
        limit=None,
        line_conditions=_line_conditions(params),
    )

    buffer = io.StringIO()
    # Точка с запятой и BOM — иначе Excel открывает файл одной колонкой
    # и портит кириллицу.
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow([dimension_title(dimension, lang), *CSV_HEADERS[lang]])
    for row in rows:
        writer.writerow(
            [
                row.name,
                row.orders_count,
                f"{row.quantity:.3f}".replace(".", ","),
                f"{row.total_amount:.2f}".replace(".", ","),
                f"{row.share * 100:.1f}".replace(".", ","),
            ]
        )
    writer.writerow([CSV_TOTAL[lang], "", "", f"{total:.2f}".replace(".", ","), ""])

    filename = f"qoqo-{dimension.value}-{params.date_from}-{params.date_to}.csv"
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- Топ продаж ----------------------------------------------------------


@router.get("/top", response_model=TopReport)
def top_report(
    db: DbSession,
    user: ReportUser,
    params: ReportParams,
    dimension: Dimension = Dimension.NOMENCLATURE,
    limit: int = Query(default=10, ge=1, le=100),
) -> TopReport:
    """Лидеры продаж за период с приростом к предыдущему такому же периоду.

    Прирост считается по тому же ключу разреза, поэтому позиция, которой в
    прошлом периоде не продавали, показывается как новая, а не как рост в
    бесконечное число раз.
    """

    line_conditions = _line_conditions(params)
    rows, total, _ = _breakdown_rows(
        db, _conditions(user, params), dimension, limit, line_conditions
    )

    previous_params = params.previous
    previous_rows, _, _ = _breakdown_rows(
        db, _conditions(user, previous_params), dimension, None, line_conditions
    )
    previous_by_id = {row.id: row.total_amount for row in previous_rows}

    result: list[TopRow] = []
    for row in rows:
        previous_amount = previous_by_id.get(row.id, Decimal(0))
        change = (
            float((row.total_amount - previous_amount) / previous_amount)
            if previous_amount
            else None
        )
        result.append(
            TopRow(
                id=row.id,
                name=row.name,
                orders_count=row.orders_count,
                quantity=row.quantity,
                total_amount=row.total_amount,
                share=float(row.total_amount / total) if total else 0.0,
                previous_amount=previous_amount,
                change=change,
            )
        )

    return TopReport(
        date_from=params.date_from,
        date_to=params.date_to,
        previous_from=previous_params.date_from,
        previous_to=previous_params.date_to,
        dimension=dimension,
        dimension_title=DIMENSION_TITLES[dimension],
        rows=result,
    )


# --- Оборачиваемость -----------------------------------------------------

# Точка, не заказывавшая дольше этого срока, считается уснувшей.
SLEEPING_AFTER_DAYS = 30
LOST_AFTER_DAYS = 60


def _turnover_status(days_since_last: int | None) -> str:
    if days_since_last is None:
        return "no_orders"
    if days_since_last > LOST_AFTER_DAYS:
        return "lost"
    if days_since_last > SLEEPING_AFTER_DAYS:
        return "sleeping"
    return "active"


@router.get("/turnover", response_model=TurnoverReport)
def turnover_report(
    db: DbSession,
    user: ReportUser,
    params: ReportParams,
    limit: int = Query(default=100, ge=1, le=500),
) -> TurnoverReport:
    """Как часто заказывают торговые точки.

    Это оборачиваемость по точкам, а не по запасам: остатков на складах система
    пока не ведёт, поэтому оборачиваемость товара считать не из чего. Здесь —
    частота заказов, средний интервал между ними и давность последней заявки.
    """

    conditions = _conditions(user, params)
    line_conditions = _line_conditions(params)

    order_date = func.date(Order.order_date)
    stmt = (
        select(
            Order.outlet_id,
            func.coalesce(Outlet.name, "Без торговой точки").label("name"),
            OutletType.name.label("outlet_type"),
            func.count(func.distinct(Order.id)).label("orders_count"),
            func.coalesce(func.sum(OrderLine.amount), 0).label("amount"),
            func.min(order_date).label("first_order"),
            func.max(order_date).label("last_order"),
        )
        .select_from(Order)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .join(Outlet, Outlet.id == Order.outlet_id, isouter=True)
        .join(OutletType, OutletType.id == Outlet.outlet_type_id, isouter=True)
        .where(*conditions, *line_conditions)
        .group_by(Order.outlet_id, Outlet.name, OutletType.name)
        .order_by(func.count(func.distinct(Order.id)).desc())
        .limit(limit)
    )

    today = datetime.now(UTC).date()
    rows: list[TurnoverRow] = []

    for row in db.execute(stmt).all():
        orders_count = int(row.orders_count)
        amount = Decimal(row.amount)
        first_order, last_order = row.first_order, row.last_order

        # Средний интервал: период между первой и последней заявкой, делённый на
        # число промежутков. При одной заявке промежутков нет.
        interval = None
        if orders_count > 1 and first_order and last_order:
            interval = round((last_order - first_order).days / (orders_count - 1), 1)

        days_since_last = (today - last_order).days if last_order else None

        rows.append(
            TurnoverRow(
                id=row.outlet_id,
                name=row.name,
                outlet_type=row.outlet_type,
                orders_count=orders_count,
                total_amount=amount,
                average_check=(
                    (amount / orders_count).quantize(Decimal("0.01"))
                    if orders_count
                    else Decimal(0)
                ),
                first_order=first_order,
                last_order=last_order,
                average_interval_days=interval,
                days_since_last=days_since_last,
                status=_turnover_status(days_since_last),
            )
        )

    return TurnoverReport(
        date_from=params.date_from,
        date_to=params.date_to,
        rows=rows,
        sleeping_after_days=SLEEPING_AFTER_DAYS,
    )


# --- Оборачиваемость запасов ---------------------------------------------

# Товар без движения дольше этого срока считается залежавшимся.
STALE_AFTER_DAYS = 30


@router.get("/stock-turnover", response_model=StockTurnoverReport)
def stock_turnover(
    db: DbSession,
    user: ReportUser,
    params: ReportParams,
    warehouse_id: uuid.UUID | None = None,
    only_moved: bool = True,
) -> StockTurnoverReport:
    """Оборачиваемость запасов: за сколько дней распродаётся средний остаток.

    Средний остаток считаем как полусумму на начало и на конец периода —
    общепринятое упрощение: считать по каждому дню дороже, а результат почти
    тот же.
    """

    start = datetime.combine(params.date_from, time.min, tzinfo=UTC)
    end = datetime.combine(params.date_to, time.max, tzinfo=UTC)

    warehouse_key = StockMovement.warehouse_id
    product_key = StockMovement.nomenclature_id

    def grouped(*conditions: Any) -> dict[tuple[uuid.UUID, uuid.UUID], Decimal]:
        stmt = (
            select(warehouse_key, product_key, func.coalesce(func.sum(StockMovement.quantity), 0))
            .group_by(warehouse_key, product_key)
            .where(*conditions)
        )
        if warehouse_id is not None:
            stmt = stmt.where(warehouse_key == warehouse_id)
        return {(row[0], row[1]): Decimal(row[2]) for row in db.execute(stmt).all()}

    opening = grouped(StockMovement.moved_at < start)
    closing = grouped(StockMovement.moved_at <= end)
    consumed = {
        key: abs(value)
        for key, value in grouped(
            StockMovement.moved_at.between(start, end), StockMovement.quantity < 0
        ).items()
    }
    received = grouped(StockMovement.moved_at.between(start, end), StockMovement.quantity > 0)

    last_stmt = select(
        warehouse_key, product_key, func.max(func.date(StockMovement.moved_at))
    ).group_by(warehouse_key, product_key)
    if warehouse_id is not None:
        last_stmt = last_stmt.where(warehouse_key == warehouse_id)
    last_moved = {(row[0], row[1]): row[2] for row in db.execute(last_stmt).all()}

    keys = set(opening) | set(closing)
    empty = StockTurnoverReport(
        date_from=params.date_from,
        date_to=params.date_to,
        days=params.days,
        rows=[],
        stale_after_days=STALE_AFTER_DAYS,
    )
    if not keys:
        return empty

    warehouses = {
        row.id: row
        for row in db.execute(
            select(Warehouse).where(Warehouse.id.in_({item[0] for item in keys}))
        ).scalars()
    }
    products = {
        row.id: row
        for row in db.execute(
            select(Nomenclature).where(Nomenclature.id.in_({item[1] for item in keys}))
        )
        .unique()
        .scalars()
    }

    today = datetime.now(UTC).date()
    rows: list[StockTurnoverRow] = []

    for item in keys:
        warehouse = warehouses.get(item[0])
        product = products.get(item[1])
        if warehouse is None or product is None:
            continue

        gone = consumed.get(item, Decimal(0))
        came = received.get(item, Decimal(0))
        if only_moved and gone == 0 and came == 0:
            continue

        open_qty = opening.get(item, Decimal(0))
        close_qty = closing.get(item, Decimal(0))
        average = (open_qty + close_qty) / 2

        ratio = float(gone / average) if average > 0 else None
        days_to_sell = params.days / ratio if ratio else None
        per_day = gone / params.days if params.days else Decimal(0)
        supply = float(close_qty / per_day) if per_day > 0 else None

        moved_on = last_moved.get(item)
        idle = (today - moved_on).days if moved_on else None

        rows.append(
            StockTurnoverRow(
                warehouse_id=item[0],
                warehouse_name=warehouse.name,
                nomenclature_id=item[1],
                nomenclature_name=product.name,
                unit_name=product.base_unit.name if product.base_unit else None,
                opening=open_qty,
                closing=close_qty,
                average=average,
                consumed=gone,
                received=came,
                turnover_ratio=round(ratio, 3) if ratio else None,
                days_to_sell=round(days_to_sell, 1) if days_to_sell else None,
                days_of_supply=round(supply, 1) if supply else None,
                last_movement=moved_on,
                days_without_movement=idle,
            )
        )

    # Сверху то, что расходится медленнее всего: именно там заморожены деньги.
    rows.sort(key=lambda row: (row.turnover_ratio is None, row.turnover_ratio or 0))

    return StockTurnoverReport(
        date_from=params.date_from,
        date_to=params.date_to,
        days=params.days,
        rows=rows,
        stale_after_days=STALE_AFTER_DAYS,
    )


# --- Сводка руководителя -------------------------------------------------


@router.get("/dashboard", response_model=DirectorDashboard)
def director_dashboard(db: DbSession, user: ReportUser) -> DirectorDashboard:
    """Одним экраном: продажи, долги, что зависло и как идут маршруты."""

    today = datetime.now(UTC).date()

    periods: list[DashboardPeriod] = []
    for label, days in (("Сегодня", 1), ("7 дней", 7), ("30 дней", 30)):
        current = ReportQuery(
            date_from=today - timedelta(days=days - 1),
            date_to=today,
            warehouse_id=None,
            outlet_id=None,
            counterparty_id=None,
            author_id=None,
        )
        now = _totals(db, _conditions(user, current))
        was = _totals(db, _conditions(user, current.previous))
        change = (
            float((now.total_amount - was.total_amount) / was.total_amount)
            if was.total_amount
            else None
        )
        periods.append(
            DashboardPeriod(
                label=label,
                orders_count=now.orders_count,
                total_amount=now.total_amount,
                change=change,
            )
        )

    balances = settlements.collect(db, today=today)
    debt = sum((item.debt for item in balances.values() if item.debt > 0), Decimal(0))
    overdue = sum((item.overdue for item in balances.values()), Decimal(0))
    overdue_parties = sum(1 for item in balances.values() if item.overdue > 0)

    to_process = db.execute(
        select(func.count())
        .select_from(Order)
        .where(Order.status.in_((OrderStatus.NEW, OrderStatus.ASSEMBLING, OrderStatus.ASSEMBLED)))
    ).scalar_one()

    quantities = stock_service.balances(db)
    busy = stock_service.reserved(db)
    out_of_stock = sum(
        1 for key, value in quantities.items() if value - busy.get(key, Decimal(0)) <= 0
    )

    stale_threshold = today - timedelta(days=STALE_AFTER_DAYS)
    stale = db.execute(
        select(func.count()).select_from(
            select(StockMovement.warehouse_id, StockMovement.nomenclature_id)
            .group_by(StockMovement.warehouse_id, StockMovement.nomenclature_id)
            .having(func.max(func.date(StockMovement.moved_at)) < stale_threshold)
            .subquery()
        )
    ).scalar_one()

    planned = db.execute(
        select(func.count()).select_from(Visit).where(Visit.planned_date == today)
    ).scalar_one()
    done = db.execute(
        select(func.count())
        .select_from(Visit)
        .where(Visit.planned_date == today)
        .where(Visit.result.in_(VISITED_RESULTS))
    ).scalar_one()

    alerts: list[DashboardAlert] = []
    if overdue > 0:
        alerts.append(
            DashboardAlert(
                kind="overdue",
                title="Просроченная задолженность",
                count=overdue_parties,
                amount=overdue,
            )
        )
    if out_of_stock > 0:
        alerts.append(
            DashboardAlert(
                kind="out_of_stock",
                title="Позиций без свободного остатка",
                count=out_of_stock,
            )
        )
    if stale > 0:
        alerts.append(
            DashboardAlert(
                kind="stale",
                title=f"Без движения дольше {STALE_AFTER_DAYS} дней",
                count=stale,
            )
        )
    if planned > done:
        alerts.append(
            DashboardAlert(kind="visits", title="Точек не посещено сегодня", count=planned - done)
        )

    return DirectorDashboard(
        periods=periods,
        debt=debt,
        overdue=overdue,
        overdue_counterparties=overdue_parties,
        orders_to_process=to_process,
        out_of_stock=out_of_stock,
        stale_items=stale,
        visits_planned=planned,
        visits_done=done,
        alerts=alerts,
    )
