import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import CurrentUser, DbSession
from app.models import (
    ALL_ORDERS_ROLES,
    FULFILMENT_ROLES,
    STATUS_TITLES,
    STATUS_TRANSITIONS,
    Nomenclature,
    Order,
    OrderLine,
    OrderStatus,
    User,
    UserRole,
)
from app.schemas.common import Page
from app.schemas.order import (
    OrderAssembly,
    OrderRead,
    OrderStats,
    OrderStatusChange,
    OrderWrite,
)

router = APIRouter(prefix="/orders", tags=["Заявки"])

# Какие переходы статуса доступны каждой роли.
ROLE_TRANSITIONS: dict[UserRole, set[OrderStatus]] = {
    UserRole.ADMIN: set(OrderStatus),
    UserRole.DIRECTOR: set(OrderStatus),
    # Торговый представитель отправляет и отменяет свою заявку.
    UserRole.SALES_REP: {OrderStatus.NEW, OrderStatus.CANCELLED},
    # Склад ведёт заявку по этапам сборки и отгрузки.
    UserRole.WAREHOUSE: {
        OrderStatus.ASSEMBLING,
        OrderStatus.ASSEMBLED,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
    },
    # Бухгалтер работает с документами и ценами, но может отменить заявку.
    UserRole.ACCOUNTANT: {OrderStatus.CANCELLED},
}

# Статусы, в которых торговый представитель ещё может править состав заявки.
EDITABLE_STATUSES = {OrderStatus.DRAFT, OrderStatus.NEW}


def serialize_order(order: Order, *, with_lines: bool = True) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": order.id,
        "number": order.number,
        "display_number": order.display_number,
        "order_date": order.order_date,
        "delivery_date": order.delivery_date,
        "status": order.status,
        "status_title": STATUS_TITLES.get(order.status, order.status.value),
        "counterparty_id": order.counterparty_id,
        "counterparty_name": order.counterparty.name if order.counterparty else "",
        "outlet_id": order.outlet_id,
        "outlet_name": order.outlet.name if order.outlet else None,
        "outlet_type_name": (
            order.outlet.outlet_type.name if order.outlet and order.outlet.outlet_type else None
        ),
        "contract_id": order.contract_id,
        "contract_name": order.contract.name if order.contract else None,
        "organization_id": order.organization_id,
        "division_id": order.division_id,
        "warehouse_id": order.warehouse_id,
        "warehouse_name": order.warehouse.name if order.warehouse else None,
        "author_id": order.author_id,
        "author_name": order.author.full_name if order.author else "",
        "delivery_address": order.delivery_address,
        "comment": order.comment,
        "total_amount": order.total_amount,
        "lines_count": len(order.lines),
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "lines": [],
    }

    if with_lines:
        data["lines"] = [
            {
                "id": line.id,
                "line_number": line.line_number,
                "nomenclature_id": line.nomenclature_id,
                "nomenclature_name": line.nomenclature.name if line.nomenclature else "",
                "unit_id": line.unit_id,
                "unit_name": line.unit.name if line.unit else None,
                "quantity": line.quantity,
                "price": line.price,
                "amount": line.amount,
                "quantity_shipped": line.quantity_shipped,
            }
            for line in order.lines
        ]

    return data


def _visible_orders_stmt(user: User) -> Any:
    stmt = select(Order).options(selectinload(Order.lines))
    if user.role not in ALL_ORDERS_ROLES:
        # Торговый представитель видит только свои заявки.
        return stmt.where(Order.author_id == user.id)

    # Чужие черновики не показываем: заявка попадает в работу после отправки.
    stmt = stmt.where((Order.status != OrderStatus.DRAFT) | (Order.author_id == user.id))

    if user.role == UserRole.WAREHOUSE and user.warehouse_id is not None:
        # Кладовщик закреплён за складом — видит его заявки и те, где склад ещё
        # не указан: иначе такая заявка не попала бы вообще ни к кому.
        stmt = stmt.where(
            (Order.warehouse_id == user.warehouse_id) | (Order.warehouse_id.is_(None))
        )

    return stmt


def _get_order_for_user(db: Session, user: User, order_id: uuid.UUID) -> Order:
    stmt = _visible_orders_stmt(user).where(Order.id == order_id)
    order = db.execute(stmt).unique().scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена")
    return order


def _rebuild_lines(db: Session, order: Order, payload: OrderWrite) -> None:
    """Пересобирает строки заявки и пересчитывает сумму."""

    order.lines.clear()
    db.flush()

    total = Decimal(0)
    for index, line in enumerate(payload.lines, start=1):
        nomenclature = db.get(Nomenclature, line.nomenclature_id)
        if nomenclature is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Номенклатура {line.nomenclature_id} не найдена",
            )

        price = line.price if line.price is not None else nomenclature.price
        amount = (Decimal(line.quantity) * Decimal(price)).quantize(Decimal("0.01"))
        total += amount

        order.lines.append(
            OrderLine(
                line_number=index,
                nomenclature_id=nomenclature.id,
                unit_id=line.unit_id or nomenclature.base_unit_id,
                quantity=line.quantity,
                price=price,
                amount=amount,
            )
        )

    order.total_amount = total


@router.get("", response_model=Page[OrderRead])
def list_orders(
    db: DbSession,
    user: CurrentUser,
    order_status: OrderStatus | None = Query(default=None, alias="status"),
    counterparty_id: uuid.UUID | None = None,
    outlet_id: uuid.UUID | None = None,
    warehouse_id: uuid.UUID | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Any:
    stmt = _visible_orders_stmt(user)

    if order_status is not None:
        stmt = stmt.where(Order.status == order_status)
    if counterparty_id is not None:
        stmt = stmt.where(Order.counterparty_id == counterparty_id)
    if outlet_id is not None:
        stmt = stmt.where(Order.outlet_id == outlet_id)
    if warehouse_id is not None:
        stmt = stmt.where(Order.warehouse_id == warehouse_id)
    if date_from:
        stmt = stmt.where(func.date(Order.order_date) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(Order.order_date) <= date_to)
    if search:
        digits = search.strip().lstrip("ЗКзк-")
        if digits.isdigit():
            stmt = stmt.where(Order.number == int(digits))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(stmt.order_by(Order.number.desc()).limit(limit).offset(offset))
        .unique()
        .scalars()
        .all()
    )

    return Page(
        items=[serialize_order(row, with_lines=False) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/stats", response_model=OrderStats)
def order_stats(db: DbSession, user: CurrentUser) -> OrderStats:
    base = _visible_orders_stmt(user).subquery()

    counts = db.execute(
        select(base.c.status, func.count()).select_from(base).group_by(base.c.status)
    ).all()

    stats = OrderStats()
    for row_status, count in counts:
        value = row_status.value if isinstance(row_status, OrderStatus) else str(row_status)
        if hasattr(stats, value):
            setattr(stats, value, count)

    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today_row = db.execute(
        select(func.count(), func.coalesce(func.sum(base.c.total_amount), 0))
        .select_from(base)
        .where(base.c.order_date >= today_start)
        .where(base.c.status != OrderStatus.CANCELLED.value)
    ).one()
    stats.orders_today = today_row[0]
    stats.total_amount_today = Decimal(today_row[1])

    return stats


@router.get("/{order_id}", response_model=OrderRead)
def get_order(order_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Any:
    return serialize_order(_get_order_for_user(db, user, order_id))


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderWrite, db: DbSession, user: CurrentUser) -> Any:
    if user.role == UserRole.WAREHOUSE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Склад не оформляет заявки",
        )

    order = Order(
        counterparty_id=payload.counterparty_id,
        outlet_id=payload.outlet_id,
        contract_id=payload.contract_id,
        organization_id=payload.organization_id or user.organization_id,
        division_id=payload.division_id or user.division_id,
        warehouse_id=payload.warehouse_id,
        delivery_date=payload.delivery_date,
        delivery_address=payload.delivery_address,
        comment=payload.comment,
        author_id=user.id,
        status=OrderStatus.DRAFT,
    )
    db.add(order)
    db.flush()

    _rebuild_lines(db, order, payload)
    db.commit()
    db.refresh(order)
    return serialize_order(order)


@router.put("/{order_id}", response_model=OrderRead)
def update_order(order_id: uuid.UUID, payload: OrderWrite, db: DbSession, user: CurrentUser) -> Any:
    order = _get_order_for_user(db, user, order_id)

    if order.status not in EDITABLE_STATUSES and user.role not in (
        UserRole.ADMIN,
        UserRole.DIRECTOR,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Заявку в статусе «{STATUS_TITLES[order.status]}» изменить нельзя",
        )

    order.counterparty_id = payload.counterparty_id
    order.outlet_id = payload.outlet_id
    order.contract_id = payload.contract_id
    order.organization_id = payload.organization_id
    order.division_id = payload.division_id
    order.warehouse_id = payload.warehouse_id
    order.delivery_date = payload.delivery_date
    order.delivery_address = payload.delivery_address
    order.comment = payload.comment

    _rebuild_lines(db, order, payload)
    db.commit()
    db.refresh(order)
    return serialize_order(order)


@router.post("/{order_id}/status", response_model=OrderRead)
def change_status(
    order_id: uuid.UUID, payload: OrderStatusChange, db: DbSession, user: CurrentUser
) -> Any:
    order = _get_order_for_user(db, user, order_id)
    new_status = payload.status

    if new_status not in STATUS_TRANSITIONS[order.status]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Переход «{STATUS_TITLES[order.status]}» → "
                f"«{STATUS_TITLES[new_status]}» не предусмотрен"
            ),
        )

    if new_status not in ROLE_TRANSITIONS.get(user.role, set()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ваша роль не может переводить заявку в этот статус",
        )

    if order.status == OrderStatus.DRAFT and new_status == OrderStatus.NEW and not order.lines:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нельзя отправить пустую заявку — добавьте хотя бы одну позицию",
        )

    order.status = new_status
    if payload.comment:
        order.comment = payload.comment

    db.commit()
    db.refresh(order)
    return serialize_order(order)


@router.post("/{order_id}/assembly", response_model=OrderRead)
def save_assembly(
    order_id: uuid.UUID, payload: OrderAssembly, db: DbSession, user: CurrentUser
) -> Any:
    """Склад фиксирует фактически собранное количество по строкам."""

    if user.role not in FULFILMENT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Сборку отмечает склад",
        )

    order = _get_order_for_user(db, user, order_id)
    by_id = {line.id: line for line in order.lines}

    for item in payload.lines:
        line = by_id.get(item.line_id)
        if line is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Строка не принадлежит этой заявке",
            )
        line.quantity_shipped = item.quantity_shipped

    # Сумма пересчитывается по фактически собранному количеству.
    total = Decimal(0)
    for line in order.lines:
        quantity = line.quantity_shipped if line.quantity_shipped is not None else line.quantity
        line.amount = (Decimal(quantity) * Decimal(line.price)).quantize(Decimal("0.01"))
        total += line.amount
    order.total_amount = total

    db.commit()
    db.refresh(order)
    return serialize_order(order)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(order_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    order = _get_order_for_user(db, user, order_id)
    if order.status != OrderStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Удалить можно только черновик — отправленную заявку отменяйте статусом",
        )
    db.delete(order)
    db.commit()


@router.get("/feed/updates", response_model=list[OrderRead])
def feed_updates(db: DbSession, user: CurrentUser, since_seconds: int = 60) -> Any:
    """Заявки, изменившиеся за последние N секунд.

    Используется списком склада для подсветки новых заявок между опросами.
    """

    since = datetime.now(UTC) - timedelta(seconds=max(since_seconds, 1))
    stmt = _visible_orders_stmt(user).where(Order.updated_at >= since)
    rows = db.execute(stmt.order_by(Order.updated_at.desc()).limit(50)).unique().scalars().all()
    return [serialize_order(row, with_lines=False) for row in rows]
