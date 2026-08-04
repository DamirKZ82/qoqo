import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import ReferenceMixin, TimestampMixin, UUIDMixin
from app.models.references import Nomenclature


class PriceType(ReferenceMixin, Base):
    """Тип цены: розница, опт, цена для сети.

    Отдельный справочник, а не колонки в номенклатуре: типов бывает сколько
    угодно, и добавлять их должен пользователь, а не разработчик.
    """

    __tablename__ = "price_types"

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Тип по умолчанию используется, когда в договоре ничего не выбрано.
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)


class Price(UUIDMixin, TimestampMixin, Base):
    """Цена номенклатуры по типу.

    История не ведётся намеренно: цена, по которой отгрузили, уже записана в
    строке заявки, и для отчётов её достаточно.
    """

    __tablename__ = "prices"
    __table_args__ = (
        UniqueConstraint("nomenclature_id", "price_type_id", name="uq_price_per_type"),
    )

    nomenclature_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("nomenclature.id", ondelete="CASCADE"), nullable=False, index=True
    )
    price_type_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("price_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)

    nomenclature: Mapped["Nomenclature"] = relationship(lazy="joined")
    price_type: Mapped["PriceType"] = relationship(lazy="joined")
