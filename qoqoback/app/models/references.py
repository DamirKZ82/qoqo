import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import ReferenceMixin

if TYPE_CHECKING:
    from app.models.user import User


class Organization(ReferenceMixin, Base):
    """Организация."""

    __tablename__ = "organizations"

    full_name: Mapped[str | None] = mapped_column(String(1000))
    bin: Mapped[str | None] = mapped_column(String(12))
    address: Mapped[str | None] = mapped_column(String(1000))
    phone: Mapped[str | None] = mapped_column(String(50))

    divisions: Mapped[list["Division"]] = relationship(back_populates="organization")
    warehouses: Mapped[list["Warehouse"]] = relationship(back_populates="organization")


class Division(ReferenceMixin, Base):
    """Подразделение. Иерархическое — parent_id ссылается на вышестоящее."""

    __tablename__ = "divisions"

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("divisions.id", ondelete="RESTRICT")
    )

    organization: Mapped["Organization | None"] = relationship(back_populates="divisions")
    parent: Mapped["Division | None"] = relationship(remote_side="Division.id")


class Warehouse(ReferenceMixin, Base):
    """Склад."""

    __tablename__ = "warehouses"

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    address: Mapped[str | None] = mapped_column(String(1000))
    phone: Mapped[str | None] = mapped_column(String(50))

    organization: Mapped["Organization | None"] = relationship(back_populates="warehouses")


class UnitOfMeasure(ReferenceMixin, Base):
    """Единица измерения."""

    __tablename__ = "units_of_measure"

    full_name: Mapped[str | None] = mapped_column(String(200))
    # Код по ОКЕИ: 166 — килограмм, 796 — штука.
    okei_code: Mapped[str | None] = mapped_column(String(10))
    # Коэффициент пересчёта в базовую единицу номенклатуры.
    ratio: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal(1), nullable=False)


class ProductCategory(ReferenceMixin, Base):
    """Номенклатурная группа: целая птица, разделка, субпродукты и т.д."""

    __tablename__ = "product_categories"

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("product_categories.id", ondelete="RESTRICT")
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    parent: Mapped["ProductCategory | None"] = relationship(remote_side="ProductCategory.id")


class Nomenclature(ReferenceMixin, Base):
    """Номенклатура."""

    __tablename__ = "nomenclature"

    full_name: Mapped[str | None] = mapped_column(String(1000))
    article: Mapped[str | None] = mapped_column(String(100), index=True)
    barcode: Mapped[str | None] = mapped_column(String(50), index=True)

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("product_categories.id", ondelete="RESTRICT")
    )
    base_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("units_of_measure.id", ondelete="RESTRICT")
    )

    # Весовой товар: заявка оформляется в килограммах, фактический вес уточняет склад.
    is_weight_goods: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal(0), nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal(12), nullable=False)

    # --- Витрина на сайте -------------------------------------------------
    #
    # Номенклатура и карточка товара на сайте — одно и то же: заводить второй
    # справочник ради витрины значило бы вести один товар в двух местах и
    # однажды их рассинхронизировать.

    # Показывать на сайте. По умолчанию нет: в номенклатуре есть служебные
    # позиции, которым на витрине не место.
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    # Человекочитаемый адрес карточки: /products/bedro-ohlazhdennoe.
    slug: Mapped[str | None] = mapped_column(String(200), unique=True, index=True)
    image_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    composition: Mapped[str | None] = mapped_column(Text)
    shelf_life: Mapped[str | None] = mapped_column(String(200))
    storage: Mapped[str | None] = mapped_column(String(300))
    pack: Mapped[str | None] = mapped_column(String(200))
    # Казахские варианты названия и текстов — сайт двуязычный.
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    category: Mapped["ProductCategory | None"] = relationship()
    base_unit: Mapped["UnitOfMeasure | None"] = relationship()


class Counterparty(ReferenceMixin, Base):
    """Контрагент: магазин, супермаркет, сеть."""

    __tablename__ = "counterparties"

    full_name: Mapped[str | None] = mapped_column(String(1000))
    bin_iin: Mapped[str | None] = mapped_column(String(12), index=True)
    is_legal_entity: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    address: Mapped[str | None] = mapped_column(String(1000))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(200))
    contact_person: Mapped[str | None] = mapped_column(String(200))

    contracts: Mapped[list["Contract"]] = relationship(back_populates="counterparty")
    outlets: Mapped[list["Outlet"]] = relationship(back_populates="counterparty")


class OutletType(ReferenceMixin, Base):
    """Тип торговой точки: магазин, супермаркет, рынок и т.д.

    Отдельный справочник, а не перечисление, чтобы список типов можно было
    пополнять без правки кода и выгружать в 1С по GUID.
    """

    __tablename__ = "outlet_types"

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Цвет метки в интерфейсе (HEX), чтобы точки различались в списке.
    color: Mapped[str | None] = mapped_column(String(7))


class Outlet(ReferenceMixin, Base):
    """Торговая точка — конкретный адрес доставки, принадлежит контрагенту."""

    __tablename__ = "outlets"

    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("counterparties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    outlet_type_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("outlet_types.id", ondelete="RESTRICT"), index=True
    )
    address: Mapped[str | None] = mapped_column(String(1000))
    phone: Mapped[str | None] = mapped_column(String(50))
    contact_person: Mapped[str | None] = mapped_column(String(200))
    # Ссылка на профиль в 2ГИС: по ней торговый представитель сразу видит
    # часы работы и проезд, не переспрашивая точку. Именно у точки, а не у
    # контрагента: у сети адресов много, и профиль в 2ГИС у каждого свой.
    dgis_url: Mapped[str | None] = mapped_column(String(1000))
    # Координаты — для маршрутов торговых представителей.
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    # Закреплённый торговый представитель.
    sales_rep_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    counterparty: Mapped["Counterparty"] = relationship(back_populates="outlets", lazy="joined")
    outlet_type: Mapped["OutletType | None"] = relationship(lazy="joined")
    sales_rep: Mapped["User | None"] = relationship(lazy="joined")


class Contract(ReferenceMixin, Base):
    """Договор с контрагентом."""

    __tablename__ = "contracts"

    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("counterparties.id", ondelete="RESTRICT"), nullable=False
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    number: Mapped[str | None] = mapped_column(String(100))
    contract_date: Mapped[date | None] = mapped_column(Date)
    # Отсрочка платежа в днях.
    payment_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Тип цен и скидка договора: по ним подбирается цена в заявке, чтобы
    # продавец не вводил её руками и не ошибался.
    price_type_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("price_types.id", ondelete="SET NULL")
    )
    discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal(0), nullable=False
    )
    credit_limit: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal(0), nullable=False
    )

    counterparty: Mapped["Counterparty"] = relationship(back_populates="contracts")
    organization: Mapped["Organization | None"] = relationship()
