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
from app.models.references import Contract, Counterparty, Organization
from app.models.user import User


class PaymentMethod(StrEnum):
    CASH = "cash"
    BANK = "bank"
    CARD = "card"


METHOD_TITLES: dict[PaymentMethod, str] = {
    PaymentMethod.CASH: "Наличные",
    PaymentMethod.BANK: "Банк",
    PaymentMethod.CARD: "Карта",
}

payment_number_seq = Sequence("payment_number_seq", start=1)


class Payment(UUIDMixin, TimestampMixin, Base):
    """Оплата от контрагента.

    Долг не хранится отдельным числом: он считается как отгруженное минус
    оплаченное, поэтому не может разойтись с документами.
    """

    __tablename__ = "payments"

    number: Mapped[int] = mapped_column(
        Integer,
        payment_number_seq,
        server_default=payment_number_seq.next_value(),
        unique=True,
        nullable=False,
    )
    payment_date: Mapped[date] = mapped_column(
        Date, server_default=func.current_date(), nullable=False, index=True
    )

    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("counterparties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("contracts.id", ondelete="RESTRICT"), index=True
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    # Оплата конкретной заявки. Пусто — общая оплата, она гасит долг с самого старого.
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(
        Enum(
            PaymentMethod,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        default=PaymentMethod.BANK,
        nullable=False,
    )
    comment: Mapped[str | None] = mapped_column(String(1000))
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )

    counterparty: Mapped["Counterparty"] = relationship(lazy="joined")
    contract: Mapped["Contract | None"] = relationship(lazy="joined")
    organization: Mapped["Organization | None"] = relationship()
    author: Mapped["User | None"] = relationship(lazy="joined")

    @property
    def display_number(self) -> str:
        return f"ОП-{self.number:06d}"
