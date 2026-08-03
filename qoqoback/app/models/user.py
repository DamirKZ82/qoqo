import uuid
from enum import StrEnum

from sqlalchemy import Boolean, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin
from app.models.references import Division, Organization, Warehouse


class UserRole(StrEnum):
    ADMIN = "admin"
    DIRECTOR = "director"
    ACCOUNTANT = "accountant"
    SALES_REP = "sales_rep"
    WAREHOUSE = "warehouse"


ROLE_TITLES: dict[UserRole, str] = {
    UserRole.ADMIN: "Администратор",
    UserRole.DIRECTOR: "Директор",
    UserRole.ACCOUNTANT: "Бухгалтер",
    UserRole.SALES_REP: "Торговый представитель",
    UserRole.WAREHOUSE: "Склад",
}

# Роли, которые собирают и отгружают заявку.
FULFILMENT_ROLES: tuple[UserRole, ...] = (
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.WAREHOUSE,
)

# Роли, которые правят справочники и контент сайта.
EDITOR_ROLES: tuple[UserRole, ...] = (
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.ACCOUNTANT,
)

# Роли, которые видят все заявки, а не только свои.
ALL_ORDERS_ROLES: tuple[UserRole, ...] = (
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.ACCOUNTANT,
    UserRole.WAREHOUSE,
)


class User(UUIDMixin, TimestampMixin, Base):
    """Сотрудник."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50))
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole, native_enum=False, length=20, values_callable=lambda e: [i.value for i in e]
        ),
        default=UserRole.SALES_REP,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="RESTRICT")
    )
    division_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("divisions.id", ondelete="RESTRICT")
    )
    # Склад по умолчанию — для сотрудников склада.
    warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("warehouses.id", ondelete="RESTRICT")
    )

    organization: Mapped["Organization | None"] = relationship(lazy="joined")
    division: Mapped["Division | None"] = relationship(lazy="joined")
    warehouse: Mapped["Warehouse | None"] = relationship(lazy="joined")
