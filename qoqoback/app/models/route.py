import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import ReferenceMixin, TimestampMixin, UUIDMixin
from app.models.references import Outlet
from app.models.user import User


class VisitResult(StrEnum):
    PLANNED = "planned"
    ORDER = "order"
    NO_ORDER = "no_order"
    CLOSED = "closed"
    REFUSED = "refused"
    SKIPPED = "skipped"


RESULT_TITLES: dict[VisitResult, str] = {
    VisitResult.PLANNED: "Запланирован",
    VisitResult.ORDER: "Заявка оформлена",
    VisitResult.NO_ORDER: "Был, без заявки",
    VisitResult.CLOSED: "Точка закрыта",
    VisitResult.REFUSED: "Отказ",
    VisitResult.SKIPPED: "Пропущен",
}

# Результаты, означающие, что представитель до точки доехал.
VISITED_RESULTS = (VisitResult.ORDER, VisitResult.NO_ORDER, VisitResult.CLOSED, VisitResult.REFUSED)


class Route(ReferenceMixin, Base):
    """Маршрут торгового представителя.

    Маршрут задаёт дни недели, а не конкретные даты: иначе план пришлось бы
    переписывать каждую неделю.
    """

    __tablename__ = "routes"

    sales_rep_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    comment: Mapped[str | None] = mapped_column(String(1000))

    sales_rep: Mapped["User | None"] = relationship(lazy="joined")
    stops: Mapped[list["RouteStop"]] = relationship(
        back_populates="route",
        cascade="all, delete-orphan",
        order_by="RouteStop.sort_order",
    )


class RouteStop(UUIDMixin, TimestampMixin, Base):
    """Точка маршрута с порядком обхода и днями посещения."""

    __tablename__ = "route_stops"
    __table_args__ = (UniqueConstraint("route_id", "outlet_id", name="uq_route_stop"),)

    route_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("routes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("outlets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Дни недели по ISO: 1 — понедельник, 7 — воскресенье. Пусто — каждый день.
    weekdays: Mapped[list[int]] = mapped_column(JSONB, default=list, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(500))

    route: Mapped["Route"] = relationship(back_populates="stops")
    outlet: Mapped["Outlet"] = relationship(lazy="joined")


class Visit(UUIDMixin, TimestampMixin, Base):
    """Визит представителя в торговую точку.

    Координаты отметки хранятся вместе с расстоянием до точки: без этого
    отчёт «план против факта» показывал бы только галочки, а не то, был ли
    представитель на месте.
    """

    __tablename__ = "visits"
    __table_args__ = (
        # Один визит на точку в день: повторная отметка — это правка той же записи.
        UniqueConstraint("sales_rep_id", "outlet_id", "planned_date", name="uq_visit_per_day"),
    )

    outlet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("outlets.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    route_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("routes.id", ondelete="SET NULL"), index=True
    )
    sales_rep_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL")
    )

    planned_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    result: Mapped[VisitResult] = mapped_column(
        Enum(
            VisitResult,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        default=VisitResult.PLANNED,
        nullable=False,
        index=True,
    )

    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    # Расстояние от места отметки до точки в метрах. None — координат нет.
    distance_m: Mapped[int | None] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String(1000))

    outlet: Mapped["Outlet"] = relationship(lazy="joined")
    sales_rep: Mapped["User"] = relationship(lazy="joined")
