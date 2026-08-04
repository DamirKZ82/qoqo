"""Маршруты и визиты торговых представителей."""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from math import asin, cos, radians, sin, sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.route import VISITED_RESULTS, Route, RouteStop, Visit, VisitResult

EARTH_RADIUS_M = 6_371_000


def distance_meters(
    lat1: Decimal | float | None,
    lon1: Decimal | float | None,
    lat2: Decimal | float | None,
    lon2: Decimal | float | None,
) -> int | None:
    """Расстояние между двумя точками по формуле гаверсинуса.

    Возвращает метры. None, если хоть одна координата неизвестна: у точки
    может быть не заполнен адрес на карте, и это не повод считать визит
    недостоверным.
    """

    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return None

    phi1, phi2 = radians(float(lat1)), radians(float(lat2))
    delta_phi = radians(float(lat2) - float(lat1))
    delta_lambda = radians(float(lon2) - float(lon1))

    a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
    return round(2 * EARTH_RADIUS_M * asin(sqrt(a)))


def is_nearby(distance: int | None) -> bool | None:
    """Считается ли отметка сделанной на месте.

    None означает «проверить нечем»: без координат нельзя ни подтвердить, ни
    опровергнуть, и показывать это надо честно, а не как нарушение.
    """

    if distance is None:
        return None
    return distance <= get_settings().visit_max_distance_m


@dataclass(slots=True)
class PlanItem:
    """Пункт плана на день: точка маршрута и визит, если он уже начат."""

    outlet_id: uuid.UUID
    outlet_name: str
    outlet_address: str | None
    outlet_type: str | None
    counterparty_name: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    route_id: uuid.UUID | None
    route_name: str | None
    sort_order: int
    visit: Visit | None


def stops_for_day(db: Session, sales_rep_id: uuid.UUID, day: date) -> list[RouteStop]:
    """Точки, которые представитель должен посетить в этот день.

    Пустой список дней у точки означает «каждый день»: так проще завести
    ежедневный обход, чем перечислять все семь.
    """

    weekday = day.isoweekday()

    stops = (
        db.execute(
            select(RouteStop)
            .join(Route, Route.id == RouteStop.route_id)
            .where(Route.sales_rep_id == sales_rep_id)
            .where(Route.is_active.is_(True))
            .order_by(RouteStop.sort_order)
        )
        .unique()
        .scalars()
        .all()
    )

    return [stop for stop in stops if not stop.weekdays or weekday in stop.weekdays]


def plan_for_day(db: Session, sales_rep_id: uuid.UUID, day: date) -> list[PlanItem]:
    """План на день: точки маршрута плюс уже отмеченные визиты.

    Визит вне маршрута тоже попадает в план: представитель мог заехать в точку
    по звонку, и в отчёте это должно быть видно.
    """

    stops = stops_for_day(db, sales_rep_id, day)

    visits = {
        visit.outlet_id: visit
        for visit in db.execute(
            select(Visit).where(Visit.sales_rep_id == sales_rep_id).where(Visit.planned_date == day)
        )
        .unique()
        .scalars()
    }

    items: list[PlanItem] = []
    seen: set[uuid.UUID] = set()

    for stop in stops:
        outlet = stop.outlet
        seen.add(outlet.id)
        items.append(
            PlanItem(
                outlet_id=outlet.id,
                outlet_name=outlet.name,
                outlet_address=outlet.address,
                outlet_type=outlet.outlet_type.name if outlet.outlet_type else None,
                counterparty_name=outlet.counterparty.name if outlet.counterparty else None,
                latitude=outlet.latitude,
                longitude=outlet.longitude,
                route_id=stop.route_id,
                route_name=stop.route.name if stop.route else None,
                sort_order=stop.sort_order,
                visit=visits.get(outlet.id),
            )
        )

    # Визиты в точки, которых в маршруте на сегодня нет, — в конец списка.
    for outlet_id, visit in visits.items():
        if outlet_id in seen:
            continue
        outlet = visit.outlet
        items.append(
            PlanItem(
                outlet_id=outlet.id,
                outlet_name=outlet.name,
                outlet_address=outlet.address,
                outlet_type=outlet.outlet_type.name if outlet.outlet_type else None,
                counterparty_name=outlet.counterparty.name if outlet.counterparty else None,
                latitude=outlet.latitude,
                longitude=outlet.longitude,
                route_id=visit.route_id,
                route_name=None,
                sort_order=9999,
                visit=visit,
            )
        )

    return items


def summarize(items: list[PlanItem]) -> dict[str, int]:
    """Сводка по плану: сколько всего, посещено, осталось и отметок не на месте."""

    planned = len(items)
    visited = sum(1 for item in items if item.visit and item.visit.result in VISITED_RESULTS)
    skipped = sum(1 for item in items if item.visit and item.visit.result == VisitResult.SKIPPED)
    far_away = sum(
        1 for item in items if item.visit is not None and is_nearby(item.visit.distance_m) is False
    )

    return {
        "planned": planned,
        "visited": visited,
        "skipped": skipped,
        "left": planned - visited - skipped,
        "far_away": far_away,
    }
