import csv
import io
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.core.deps import DbSession, require_roles
from app.models import (
    Counterparty,
    Nomenclature,
    Order,
    OrderLine,
    OrderStatus,
    Outlet,
    ProductCategory,
    User,
    UserRole,
    Warehouse,
)
from app.schemas.report import (
    CSV_HEADERS,
    CSV_TOTAL,
    DIMENSION_TITLES,
    BreakdownReport,
    BreakdownRow,
    Dimension,
    ExportLanguage,
    PeriodGroup,
    ReportTotals,
    SalesPoint,
    SalesReport,
    dimension_title,
)
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


def _totals(db: Session, conditions: list[ColumnElement[bool]]) -> ReportTotals:
    orders_row = db.execute(
        select(
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_amount), 0),
            func.count(func.distinct(Order.outlet_id)),
        ).where(*conditions)
    ).one()

    lines_row = db.execute(
        select(
            func.count(OrderLine.id),
            func.coalesce(
                func.sum(func.coalesce(OrderLine.quantity_shipped, OrderLine.quantity)), 0
            ),
        )
        .select_from(Order)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .where(*conditions)
    ).one()

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
    previous_params = params.previous

    bucket = func.date_trunc(group_by.value, Order.order_date)
    rows = db.execute(
        select(
            bucket.label("bucket"),
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_amount), 0),
        )
        .where(*conditions)
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
        totals=_totals(db, conditions),
        previous=_totals(db, _conditions(user, previous_params)),
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

    stmt = stmt.where(*conditions).group_by(key, name).order_by(amount.desc())

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

    rows, total, shown = _breakdown_rows(db, _conditions(user, params), dimension, limit)

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

    rows, total, _ = _breakdown_rows(db, _conditions(user, params), dimension, limit=None)

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
