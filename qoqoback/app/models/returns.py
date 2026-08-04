import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Date,
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
from app.models.references import Counterparty, Nomenclature, Outlet, Warehouse
from app.models.user import User


class ReturnReason(StrEnum):
    EXPIRED = "expired"
    DEFECT = "defect"
    SURPLUS = "surplus"
    MISGRADE = "misgrade"
    OTHER = "other"


REASON_TITLES: dict[ReturnReason, str] = {
    ReturnReason.EXPIRED: "Истёк срок",
    ReturnReason.DEFECT: "Брак",
    ReturnReason.SURPLUS: "Не продалось",
    ReturnReason.MISGRADE: "Пересорт",
    ReturnReason.OTHER: "Другое",
}

# Причины, по которым товар нельзя вернуть в продажу. Он приходит на склад,
# чтобы остаток сошёлся, но дальше его списывают отдельным документом.
UNSALEABLE_REASONS = (ReturnReason.EXPIRED, ReturnReason.DEFECT)


class ReturnStatus(StrEnum):
    DRAFT = "draft"
    POSTED = "posted"


return_number_seq = Sequence("return_number_seq", start=1)


class Return(UUIDMixin, TimestampMixin, Base):
    """Возврат товара от клиента.

    Проведение делает две вещи сразу: возвращает товар на склад и уменьшает
    долг контрагента. Если сделать только одно, остатки или взаиморасчёты
    разойдутся с реальностью.
    """

    __tablename__ = "returns"

    number: Mapped[int] = mapped_column(
        Integer,
        return_number_seq,
        server_default=return_number_seq.next_value(),
        unique=True,
        nullable=False,
    )
    return_date: Mapped[date] = mapped_column(
        Date, server_default=func.current_date(), nullable=False, index=True
    )
    status: Mapped[ReturnStatus] = mapped_column(
        Enum(
            ReturnStatus,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        default=ReturnStatus.DRAFT,
        nullable=False,
        index=True,
    )

    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("counterparties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("outlets.id", ondelete="RESTRICT")
    )
    # Заявка, по которой везли товар. Пусто — возврат уменьшает долг с самого старого.
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )

    reason: Mapped[ReturnReason] = mapped_column(
        Enum(
            ReturnReason,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        default=ReturnReason.OTHER,
        nullable=False,
        index=True,
    )
    comment: Mapped[str | None] = mapped_column(String(1000))
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal(0), nullable=False
    )

    counterparty: Mapped["Counterparty"] = relationship(lazy="joined")
    outlet: Mapped["Outlet | None"] = relationship(lazy="joined")
    warehouse: Mapped["Warehouse"] = relationship(lazy="joined")
    author: Mapped["User | None"] = relationship(lazy="joined")
    lines: Mapped[list["ReturnLine"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="ReturnLine.line_number",
    )

    @property
    def display_number(self) -> str:
        return f"ВЗ-{self.number:06d}"


class ReturnLine(UUIDMixin, Base):
    """Строка возврата."""

    __tablename__ = "return_lines"

    return_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("returns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    nomenclature_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("nomenclature.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 3), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal(0), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal(0), nullable=False)

    document: Mapped["Return"] = relationship(back_populates="lines")
    nomenclature: Mapped["Nomenclature"] = relationship(lazy="joined")
