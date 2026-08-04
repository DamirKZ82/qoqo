import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
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
from app.models.references import Nomenclature, Warehouse
from app.models.user import User


class StockDocumentType(StrEnum):
    RECEIPT = "receipt"
    WRITEOFF = "writeoff"
    INVENTORY = "inventory"
    SHIPMENT = "shipment"
    RETURN = "return"


DOCUMENT_TITLES: dict[StockDocumentType, str] = {
    StockDocumentType.RECEIPT: "Поступление",
    StockDocumentType.WRITEOFF: "Списание",
    StockDocumentType.INVENTORY: "Инвентаризация",
    StockDocumentType.SHIPMENT: "Отгрузка",
    StockDocumentType.RETURN: "Возврат от клиента",
}

DOCUMENT_PREFIXES: dict[StockDocumentType, str] = {
    StockDocumentType.RECEIPT: "ПР",
    StockDocumentType.WRITEOFF: "СП",
    StockDocumentType.INVENTORY: "ИН",
    StockDocumentType.SHIPMENT: "ОТ",
    StockDocumentType.RETURN: "ВЗ",
}

# Знак движения по каждому виду документа. У инвентаризации знака нет:
# движение считается как разница между фактом и учётным остатком.
DOCUMENT_SIGNS: dict[StockDocumentType, int] = {
    StockDocumentType.RECEIPT: 1,
    StockDocumentType.WRITEOFF: -1,
    StockDocumentType.SHIPMENT: -1,
    # Возврат приходует товар обратно на склад.
    StockDocumentType.RETURN: 1,
}


class StockDocumentStatus(StrEnum):
    DRAFT = "draft"
    POSTED = "posted"


stock_number_seq = Sequence("stock_document_number_seq", start=1)


class StockDocument(UUIDMixin, TimestampMixin, Base):
    """Складской документ: поступление, списание, инвентаризация, отгрузка.

    Один вид документа на все движения — так проще, чем четыре почти одинаковые
    таблицы, а тип отличает поведение при проведении.
    """

    __tablename__ = "stock_documents"

    number: Mapped[int] = mapped_column(
        Integer,
        stock_number_seq,
        server_default=stock_number_seq.next_value(),
        unique=True,
        nullable=False,
    )
    document_type: Mapped[StockDocumentType] = mapped_column(
        Enum(
            StockDocumentType,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        nullable=False,
        index=True,
    )
    status: Mapped[StockDocumentStatus] = mapped_column(
        Enum(
            StockDocumentStatus,
            native_enum=False,
            length=20,
            values_callable=lambda e: [i.value for i in e],
        ),
        default=StockDocumentStatus.DRAFT,
        nullable=False,
        index=True,
    )

    document_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    # Заявка, по которой сделана отгрузка. У прочих документов пусто.
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    # Возврат, породивший приход. У прочих документов пусто.
    return_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("returns.id", ondelete="SET NULL"), index=True
    )

    comment: Mapped[str | None] = mapped_column(String(1000))
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal(0), nullable=False
    )

    warehouse: Mapped["Warehouse"] = relationship(lazy="joined")
    author: Mapped["User | None"] = relationship(lazy="joined")
    lines: Mapped[list["StockDocumentLine"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="StockDocumentLine.line_number",
    )

    @property
    def display_number(self) -> str:
        return f"{DOCUMENT_PREFIXES[self.document_type]}-{self.number:06d}"


class StockDocumentLine(UUIDMixin, Base):
    """Строка складского документа."""

    __tablename__ = "stock_document_lines"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("stock_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    nomenclature_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("nomenclature.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 3), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal(0), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal(0), nullable=False)
    # Учётный остаток на момент инвентаризации — чтобы видеть расхождение.
    expected_quantity: Mapped[Decimal | None] = mapped_column(Numeric(15, 3))

    document: Mapped["StockDocument"] = relationship(back_populates="lines")
    nomenclature: Mapped["Nomenclature"] = relationship(lazy="joined")


class StockMovement(UUIDMixin, Base):
    """Движение товара по складу.

    Остаток — это сумма движений, а не отдельно хранимое число: так он не может
    разойтись с документами. Проведение документа создаёт движения, отмена —
    удаляет.
    """

    __tablename__ = "stock_movements"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("stock_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    nomenclature_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("nomenclature.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Со знаком: приход положительный, расход отрицательный.
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 3), nullable=False)
    moved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
