"""Что торговый представитель видит из общих данных.

Прятать пункты меню недостаточно: адрес запроса легко подобрать, а данные
отдаёт сервер. Ограничения живут здесь, а меню лишь повторяет их.

«Свои точки» — это точки, закреплённые за представителем, и точки его
маршрутов. Два признака, а не один, потому что закрепление могут не заполнить,
а маршрут представителю всё равно выдадут: иначе он не увидел бы точку, в
которую его сегодня отправили.
"""

import uuid

from sqlalchemy import ColumnElement, Select, select, union

from app.models import Outlet, User, UserRole
from app.models.route import Route, RouteStop


def is_field_user(user: User) -> bool:
    return user.role == UserRole.SALES_REP


def own_outlet_ids(user_id: uuid.UUID) -> Select[tuple[uuid.UUID]]:
    """Идентификаторы точек представителя — закреплённые и маршрутные."""

    assigned = select(Outlet.id).where(Outlet.sales_rep_id == user_id)
    from_routes = (
        select(RouteStop.outlet_id)
        .join(Route, Route.id == RouteStop.route_id)
        .where(Route.sales_rep_id == user_id)
    )
    return union(assigned, from_routes)


def outlet_conditions(user: User) -> list[ColumnElement[bool]]:
    """Отбор для справочника точек: представителю — только свои."""

    if not is_field_user(user):
        return []
    return [Outlet.id.in_(own_outlet_ids(user.id))]
