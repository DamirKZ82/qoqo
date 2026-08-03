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
    Sequence,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin
from app.models.references import (
    Contract,
    Counterparty,
    Nomenclature,
    Outlet,
    UnitOfMeasure,
    Warehouse,
)
from app.models.user import User


class OrderStatus(StrEnum):
    DRAFT = "draft"
    NEW = "new"
    ASSEMBLING = "assembling"
    ASSEMBLED = "assembled"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


STATUS_TITLES: dict[OrderStatus, str] = {
    OrderStatus.DRAFT: "Черновик",
    OrderStatus.NEW: "Новая",
    OrderStatus.ASSEMBLING: "В сборке",
    OrderStatus.ASSEMBLED: "Собрана",
    OrderStatus.SHIPPED: "Отгружена",
    OrderStatus.DELIVERED: "Доставлена",
    OrderStatus.CANCELLED: "Отменена",
}

# Разрешённые переходы статусов. Проверяются на сервере, чтобы заявку нельзя
# было перевести в произвольное состояние в обход процесса.
STATUS_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.DRAFT: {OrderStatus.NEW, OrderStatus.CANCELLED},
    OrderStatus.NEW: {OrderStatus.ASSEMBLING, OrderStatus.CANCELLED},
    OrderStatus.ASSEMBLING: {OrderStatus.ASSEMBLED, OrderStatus.CANCELLED},
    OrderStatus.ASSEMBLED: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}

order_number_seq = Sequence("order_number_seq", start=1)


class Order(UUIDMixin, TimestampMixin, Base):
    """Заявка от торговой точки."""

    __tablename__ = "orders"

    number: Mapped[int] = mapped_column(
        Integer,
        order_number_seq,
        server_default=order_number_seq.next_value(),
        unique=True,
        nullable=False,
    )
    order_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    delivery_date: Mapped[date | None] = mapped_column(Date, index=True)

    status: Mapped[OrderStatus] = mapped_column(
        Enum(
            OrderStatus,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        default=OrderStatus.DRAFT,
        nullable=False,
        index=True,
    )

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    division_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("divisions.id", ondelete="RESTRICT")
    )
    warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("warehouses.id", ondelete="RESTRICT"), index=True
    )
    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("counterparties.id", ondelete="RESTRICT"), nullable=False
    )
    # Торговая точка, куда везём. Адрес доставки по умолчанию берётся из неё.
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("outlets.id", ondelete="RESTRICT"), index=True
    )
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("contracts.id", ondelete="RESTRICT")
    )
    # Торговый представитель, оформивший заявку.
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    delivery_address: Mapped[str | None] = mapped_column(String(1000))
    comment: Mapped[str | None] = mapped_column(String(2000))
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal(0), nullable=False
    )

    counterparty: Mapped["Counterparty"] = relationship(lazy="joined")
    outlet: Mapped["Outlet | None"] = relationship(lazy="joined")
    contract: Mapped["Contract | None"] = relationship(lazy="joined")
    warehouse: Mapped["Warehouse | None"] = relationship(lazy="joined")
    author: Mapped["User"] = relationship(lazy="joined")
    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderLine.line_number",
    )

    @property
    def display_number(self) -> str:
        return f"ЗК-{self.number:06d}"


class OrderLine(UUIDMixin, Base):
    """Строка заявки."""

    __tablename__ = "order_lines"

    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    nomenclature_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("nomenclature.id", ondelete="RESTRICT"), nullable=False
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("units_of_measure.id", ondelete="RESTRICT")
    )

    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 3), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal(0), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal(0), nullable=False)
    # Фактически собранное количество — заполняет склад.
    quantity_shipped: Mapped[Decimal | None] = mapped_column(Numeric(15, 3))

    order: Mapped["Order"] = relationship(back_populates="lines")
    nomenclature: Mapped["Nomenclature"] = relationship(lazy="joined")
    unit: Mapped["UnitOfMeasure | None"] = relationship(lazy="joined")
