import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.route import VisitResult
from app.schemas.common import ORMModel


class RouteStopWrite(BaseModel):
    outlet_id: uuid.UUID
    sort_order: int = 0
    # Дни недели по ISO: 1 — понедельник, 7 — воскресенье. Пусто — каждый день.
    weekdays: list[int] = Field(default_factory=list)
    comment: str | None = Field(default=None, max_length=500)


class RouteStopRead(ORMModel):
    id: uuid.UUID
    outlet_id: uuid.UUID
    outlet_name: str
    outlet_address: str | None
    # Профиль точки в 2ГИС: часы работы и проезд.
    outlet_dgis_url: str | None
    outlet_type: str | None
    sort_order: int
    weekdays: list[int]
    comment: str | None


class RouteWrite(BaseModel):
    id: uuid.UUID | None = None
    code: str | None = Field(default=None, max_length=50)
    name: str = Field(min_length=1, max_length=500)
    sales_rep_id: uuid.UUID | None = None
    comment: str | None = Field(default=None, max_length=1000)
    is_active: bool = True
    stops: list[RouteStopWrite] = Field(default_factory=list)


class RouteRead(ORMModel):
    id: uuid.UUID
    code: str | None
    name: str
    is_active: bool
    sales_rep_id: uuid.UUID | None
    sales_rep_name: str | None
    comment: str | None
    stops_count: int
    stops: list[RouteStopRead] = Field(default_factory=list)


class VisitRead(ORMModel):
    id: uuid.UUID
    outlet_id: uuid.UUID
    outlet_name: str
    route_id: uuid.UUID | None
    sales_rep_id: uuid.UUID
    sales_rep_name: str
    order_id: uuid.UUID | None
    planned_date: date
    started_at: datetime | None
    finished_at: datetime | None
    result: VisitResult
    result_title: str
    latitude: Decimal | None
    longitude: Decimal | None
    distance_m: int | None
    # None — координат нет, проверить нечем.
    is_nearby: bool | None
    comment: str | None


class VisitCheckIn(BaseModel):
    """Отметка о приходе в точку."""

    outlet_id: uuid.UUID
    route_id: uuid.UUID | None = None
    planned_date: date | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class VisitFinish(BaseModel):
    """Завершение визита с результатом."""

    result: VisitResult
    comment: str | None = Field(default=None, max_length=1000)
    order_id: uuid.UUID | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class PlanItemRead(BaseModel):
    outlet_id: uuid.UUID
    outlet_name: str
    outlet_address: str | None
    # Профиль точки в 2ГИС: часы работы и проезд.
    outlet_dgis_url: str | None
    outlet_type: str | None
    counterparty_name: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    route_id: uuid.UUID | None
    route_name: str | None
    sort_order: int
    visit: VisitRead | None


class DayPlan(BaseModel):
    day: date
    sales_rep_id: uuid.UUID
    sales_rep_name: str
    items: list[PlanItemRead]
    planned: int
    visited: int
    skipped: int
    left: int
    # Сколько отметок сделано дальше допустимого расстояния от точки.
    far_away: int
    max_distance_m: int
