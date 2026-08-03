"""Правила доступа к заявкам.

Живут отдельно от эндпоинтов, потому что одни и те же ограничения нужны и
списку заявок, и отчётам: сотрудник не должен увидеть в сводке то, чего не
видит в списке.
"""

from sqlalchemy import ColumnElement

from app.models import ALL_ORDERS_ROLES, Order, OrderStatus, User, UserRole


def visible_orders_conditions(user: User) -> list[ColumnElement[bool]]:
    """Условия, отбирающие заявки, которые сотрудник имеет право видеть."""

    if user.role not in ALL_ORDERS_ROLES:
        # Торговый представитель видит только свои заявки.
        return [Order.author_id == user.id]

    # Чужие черновики не показываем: заявка попадает в работу после отправки.
    conditions: list[ColumnElement[bool]] = [
        (Order.status != OrderStatus.DRAFT) | (Order.author_id == user.id)
    ]

    if user.role == UserRole.WAREHOUSE and user.warehouse_id is not None:
        # Кладовщик закреплён за складом — видит его заявки и те, где склад ещё
        # не указан: иначе такая заявка не попала бы вообще ни к кому.
        conditions.append(
            (Order.warehouse_id == user.warehouse_id) | (Order.warehouse_id.is_(None))
        )

    return conditions
