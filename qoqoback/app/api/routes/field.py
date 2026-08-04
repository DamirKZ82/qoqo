import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.models import User, UserRole
from app.models.route import (
    RESULT_TITLES,
    Route,
    RouteStop,
    Visit,
    VisitResult,
)
from app.schemas.common import Page
from app.schemas.route import (
    DayPlan,
    RouteRead,
    RouteWrite,
    VisitCheckIn,
    VisitFinish,
    VisitRead,
)
from app.services import routes as routes_service

router = APIRouter(prefix="/field", tags=["Маршруты и визиты"])

# Маршруты составляют администратор и директор; представитель по ним ходит.
PLANNER_ROLES = (UserRole.ADMIN, UserRole.DIRECTOR)
# Кто видит чужие маршруты и визиты.
SUPERVISOR_ROLES = (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.ACCOUNTANT)


def _require_planner(user: User) -> None:
    if user.role not in PLANNER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Маршруты составляют администратор и директор",
        )


def serialize_visit(visit: Visit) -> dict[str, Any]:
    return {
        "id": visit.id,
        "outlet_id": visit.outlet_id,
        "outlet_name": visit.outlet.name if visit.outlet else "",
        "route_id": visit.route_id,
        "sales_rep_id": visit.sales_rep_id,
        "sales_rep_name": visit.sales_rep.full_name if visit.sales_rep else "",
        "order_id": visit.order_id,
        "planned_date": visit.planned_date,
        "started_at": visit.started_at,
        "finished_at": visit.finished_at,
        "result": visit.result,
        "result_title": RESULT_TITLES.get(visit.result, visit.result.value),
        "latitude": visit.latitude,
        "longitude": visit.longitude,
        "distance_m": visit.distance_m,
        "is_nearby": routes_service.is_nearby(visit.distance_m),
        "comment": visit.comment,
    }


def serialize_route(route: Route, *, with_stops: bool = True) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": route.id,
        "code": route.code,
        "name": route.name,
        "is_active": route.is_active,
        "sales_rep_id": route.sales_rep_id,
        "sales_rep_name": route.sales_rep.full_name if route.sales_rep else None,
        "comment": route.comment,
        "stops_count": len(route.stops),
        "stops": [],
    }

    if with_stops:
        data["stops"] = [
            {
                "id": stop.id,
                "outlet_id": stop.outlet_id,
                "outlet_name": stop.outlet.name if stop.outlet else "",
                "outlet_address": stop.outlet.address if stop.outlet else None,
                "outlet_dgis_url": stop.outlet.dgis_url if stop.outlet else None,
                "outlet_type": (
                    stop.outlet.outlet_type.name
                    if stop.outlet and stop.outlet.outlet_type
                    else None
                ),
                "sort_order": stop.sort_order,
                "weekdays": stop.weekdays or [],
                "comment": stop.comment,
            }
            for stop in route.stops
        ]

    return data


# --- План на день --------------------------------------------------------


@router.get("/plan", response_model=DayPlan)
def day_plan(
    db: DbSession,
    user: CurrentUser,
    day: date | None = None,
    sales_rep_id: uuid.UUID | None = None,
) -> DayPlan:
    """План представителя на день.

    Свой план видит любой представитель; чужой — только руководители.
    """

    target_day = day or datetime.now(UTC).date()
    target_rep = sales_rep_id or user.id

    if target_rep != user.id and user.role not in SUPERVISOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Чужой маршрут доступен руководителю",
        )

    rep = db.get(User, target_rep)
    if rep is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")

    items = routes_service.plan_for_day(db, target_rep, target_day)
    summary = routes_service.summarize(items)

    return DayPlan(
        day=target_day,
        sales_rep_id=target_rep,
        sales_rep_name=rep.full_name,
        items=[
            {
                "outlet_id": item.outlet_id,
                "outlet_name": item.outlet_name,
                "outlet_address": item.outlet_address,
                "outlet_dgis_url": item.outlet_dgis_url,
                "outlet_type": item.outlet_type,
                "counterparty_name": item.counterparty_name,
                "latitude": item.latitude,
                "longitude": item.longitude,
                "route_id": item.route_id,
                "route_name": item.route_name,
                "sort_order": item.sort_order,
                "visit": serialize_visit(item.visit) if item.visit else None,
            }
            for item in items
        ],
        max_distance_m=get_settings().visit_max_distance_m,
        **summary,
    )


# --- Визиты --------------------------------------------------------------


@router.post("/visits", response_model=VisitRead, status_code=status.HTTP_201_CREATED)
def check_in(payload: VisitCheckIn, db: DbSession, user: CurrentUser) -> Any:
    """Отметка о приходе в точку.

    Расстояние до точки считается сразу: потом координаты уже не проверить, а
    именно они отличают визит от галочки, поставленной из машины.
    """

    target_day = payload.planned_date or datetime.now(UTC).date()

    visit = (
        db.execute(
            select(Visit)
            .where(Visit.sales_rep_id == user.id)
            .where(Visit.outlet_id == payload.outlet_id)
            .where(Visit.planned_date == target_day)
        )
        .unique()
        .scalar_one_or_none()
    )

    if visit is None:
        visit = Visit(
            outlet_id=payload.outlet_id,
            route_id=payload.route_id,
            sales_rep_id=user.id,
            planned_date=target_day,
        )
        db.add(visit)

    visit.started_at = visit.started_at or datetime.now(UTC)
    visit.latitude = payload.latitude
    visit.longitude = payload.longitude

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Визит в эту точку на сегодня уже отмечен",
        ) from exc

    outlet = visit.outlet
    visit.distance_m = routes_service.distance_meters(
        payload.latitude, payload.longitude, outlet.latitude, outlet.longitude
    )

    db.commit()
    db.refresh(visit)
    return serialize_visit(visit)


@router.post("/visits/{visit_id}/finish", response_model=VisitRead)
def finish_visit(
    visit_id: uuid.UUID, payload: VisitFinish, db: DbSession, user: CurrentUser
) -> Any:
    """Завершение визита с результатом."""

    visit = db.get(Visit, visit_id)
    if visit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Визит не найден")

    if visit.sales_rep_id != user.id and user.role not in SUPERVISOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Это визит другого сотрудника"
        )

    visit.result = payload.result
    visit.comment = payload.comment
    visit.order_id = payload.order_id
    visit.finished_at = datetime.now(UTC)

    # Координаты на выходе точнее: на входе сигнал часто ещё не поймался.
    if payload.latitude is not None and payload.longitude is not None:
        visit.latitude = payload.latitude
        visit.longitude = payload.longitude
        visit.distance_m = routes_service.distance_meters(
            payload.latitude, payload.longitude, visit.outlet.latitude, visit.outlet.longitude
        )

    db.commit()
    db.refresh(visit)
    return serialize_visit(visit)


@router.get("/visits", response_model=Page[VisitRead])
def list_visits(
    db: DbSession,
    user: CurrentUser,
    sales_rep_id: uuid.UUID | None = None,
    outlet_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    result: VisitResult | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> Any:
    stmt = select(Visit)

    if user.role not in SUPERVISOR_ROLES:
        stmt = stmt.where(Visit.sales_rep_id == user.id)
    elif sales_rep_id is not None:
        stmt = stmt.where(Visit.sales_rep_id == sales_rep_id)

    if outlet_id is not None:
        stmt = stmt.where(Visit.outlet_id == outlet_id)
    if date_from is not None:
        stmt = stmt.where(Visit.planned_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Visit.planned_date <= date_to)
    if result is not None:
        stmt = stmt.where(Visit.result == result)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(
            stmt.order_by(Visit.planned_date.desc(), Visit.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .unique()
        .scalars()
        .all()
    )

    return Page(
        items=[serialize_visit(row) for row in rows], total=total, limit=limit, offset=offset
    )


# --- Маршруты ------------------------------------------------------------


@router.get("/routes", response_model=Page[RouteRead])
def list_routes(
    db: DbSession,
    user: CurrentUser,
    sales_rep_id: uuid.UUID | None = None,
    only_active: bool = True,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Any:
    stmt = select(Route).options(selectinload(Route.stops))

    if user.role not in SUPERVISOR_ROLES:
        stmt = stmt.where(Route.sales_rep_id == user.id)
    elif sales_rep_id is not None:
        stmt = stmt.where(Route.sales_rep_id == sales_rep_id)

    if only_active:
        stmt = stmt.where(Route.is_active.is_(True))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(stmt.order_by(Route.name).limit(limit).offset(offset)).unique().scalars().all()
    )

    return Page(
        items=[serialize_route(row, with_stops=False) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/routes/{route_id}", response_model=RouteRead)
def get_route(route_id: uuid.UUID, db: DbSession, _: CurrentUser) -> Any:
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")
    return serialize_route(route)


def _fill_stops(route: Route, payload: RouteWrite, db: DbSession) -> None:
    route.stops.clear()
    db.flush()

    for index, stop in enumerate(payload.stops):
        route.stops.append(
            RouteStop(
                outlet_id=stop.outlet_id,
                sort_order=stop.sort_order or index,
                # Дни держим отсортированными: так их проще читать в интерфейсе.
                weekdays=sorted({day for day in stop.weekdays if 1 <= day <= 7}),
                comment=stop.comment,
            )
        )


@router.post("/routes", response_model=RouteRead, status_code=status.HTTP_201_CREATED)
def create_route(payload: RouteWrite, db: DbSession, user: CurrentUser) -> Any:
    _require_planner(user)

    data = payload.model_dump(exclude={"stops"})
    if data.get("id") is None:
        data.pop("id", None)

    route = Route(**data)
    db.add(route)
    db.flush()

    _fill_stops(route, payload, db)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Одна и та же точка добавлена в маршрут дважды",
        ) from exc

    db.refresh(route)
    return serialize_route(route)


@router.put("/routes/{route_id}", response_model=RouteRead)
def update_route(route_id: uuid.UUID, payload: RouteWrite, db: DbSession, user: CurrentUser) -> Any:
    _require_planner(user)

    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")

    route.code = payload.code
    route.name = payload.name
    route.sales_rep_id = payload.sales_rep_id
    route.comment = payload.comment
    route.is_active = payload.is_active

    _fill_stops(route, payload, db)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Одна и та же точка добавлена в маршрут дважды",
        ) from exc

    db.refresh(route)
    return serialize_route(route)


@router.delete("/routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_route(route_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    _require_planner(user)

    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Маршрут не найден")

    # Не удаляем: на маршрут ссылаются визиты прошлых дней.
    route.is_active = False
    db.commit()
