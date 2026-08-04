import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


class ReferenceBase(BaseModel):
    """Общие реквизиты справочника.

    id можно передать явно — так объект заводится с GUID из 1С.
    """

    id: uuid.UUID | None = None
    code: str | None = Field(default=None, max_length=50)
    name: str = Field(min_length=1, max_length=500)
    is_active: bool = True


class ReferenceRead(ORMModel):
    id: uuid.UUID
    code: str | None
    name: str
    is_active: bool


# --- Организация ---------------------------------------------------------


class OrganizationWrite(ReferenceBase):
    full_name: str | None = None
    bin: str | None = Field(default=None, max_length=12)
    address: str | None = None
    phone: str | None = None


class OrganizationRead(ReferenceRead):
    full_name: str | None
    bin: str | None
    address: str | None
    phone: str | None


# --- Подразделение -------------------------------------------------------


class DivisionWrite(ReferenceBase):
    organization_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None


class DivisionRead(ReferenceRead):
    organization_id: uuid.UUID | None
    parent_id: uuid.UUID | None


# --- Склад ---------------------------------------------------------------


class WarehouseWrite(ReferenceBase):
    organization_id: uuid.UUID | None = None
    address: str | None = None
    phone: str | None = None


class WarehouseRead(ReferenceRead):
    organization_id: uuid.UUID | None
    address: str | None
    phone: str | None


# --- Единица измерения ---------------------------------------------------


class UnitOfMeasureWrite(ReferenceBase):
    full_name: str | None = None
    okei_code: str | None = Field(default=None, max_length=10)
    ratio: Decimal = Decimal(1)


class UnitOfMeasureRead(ReferenceRead):
    full_name: str | None
    okei_code: str | None
    ratio: Decimal


# --- Номенклатурная группа -----------------------------------------------


class ProductCategoryWrite(ReferenceBase):
    parent_id: uuid.UUID | None = None
    sort_order: int = 0


class ProductCategoryRead(ReferenceRead):
    parent_id: uuid.UUID | None
    sort_order: int


# --- Номенклатура --------------------------------------------------------


class NomenclatureWrite(ReferenceBase):
    full_name: str | None = None
    article: str | None = None
    barcode: str | None = None
    category_id: uuid.UUID | None = None
    base_unit_id: uuid.UUID | None = None
    is_weight_goods: bool = True
    price: Decimal = Decimal(0)
    vat_rate: Decimal = Decimal(12)


class NomenclatureRead(ReferenceRead):
    full_name: str | None
    article: str | None
    barcode: str | None
    category_id: uuid.UUID | None
    base_unit_id: uuid.UUID | None
    is_weight_goods: bool
    price: Decimal
    vat_rate: Decimal
    category_name: str | None = None
    unit_name: str | None = None


# --- Контрагент ----------------------------------------------------------


class CounterpartyWrite(ReferenceBase):
    full_name: str | None = None
    bin_iin: str | None = Field(default=None, max_length=12)
    is_legal_entity: bool = True
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    contact_person: str | None = None


class CounterpartyRead(ReferenceRead):
    full_name: str | None
    bin_iin: str | None
    is_legal_entity: bool
    address: str | None
    phone: str | None
    email: str | None
    contact_person: str | None


# --- Тип торговой точки --------------------------------------------------


class OutletTypeWrite(ReferenceBase):
    sort_order: int = 0
    color: str | None = Field(default=None, max_length=7)


class OutletTypeRead(ReferenceRead):
    sort_order: int
    color: str | None


# --- Торговая точка ------------------------------------------------------


class OutletWrite(ReferenceBase):
    counterparty_id: uuid.UUID
    outlet_type_id: uuid.UUID | None = None
    address: str | None = None
    phone: str | None = None
    contact_person: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    sales_rep_id: uuid.UUID | None = None
    dgis_url: str | None = Field(default=None, max_length=1000)

    @field_validator("dgis_url")
    @classmethod
    def _normalize_dgis_url(cls, value: str | None) -> str | None:
        """Дописывает схему: без неё ссылка ведёт внутрь системы, а не в 2ГИС.

        Адрес из 2ГИС копируют по-разному — целиком, без «https://», иногда
        с пробелами по краям. Чинить это руками пользователь не должен.
        """

        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if not value.startswith(("http://", "https://")):
            value = f"https://{value}"
        return value


class OutletRead(ReferenceRead):
    counterparty_id: uuid.UUID
    counterparty_name: str | None = None
    outlet_type_id: uuid.UUID | None
    outlet_type_name: str | None = None
    outlet_type_color: str | None = None
    address: str | None
    phone: str | None
    contact_person: str | None
    dgis_url: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    sales_rep_id: uuid.UUID | None


# --- Договор -------------------------------------------------------------


class ContractWrite(ReferenceBase):
    counterparty_id: uuid.UUID
    organization_id: uuid.UUID | None = None
    number: str | None = None
    contract_date: date | None = None
    payment_days: int = 0
    credit_limit: Decimal = Decimal(0)
    price_type_id: uuid.UUID | None = None
    discount_percent: Decimal = Decimal(0)


class ContractRead(ReferenceRead):
    counterparty_id: uuid.UUID
    organization_id: uuid.UUID | None
    number: str | None
    contract_date: date | None
    payment_days: int
    credit_limit: Decimal
    price_type_id: uuid.UUID | None
    discount_percent: Decimal


# --- Тип цены ------------------------------------------------------------


class PriceTypeWrite(ReferenceBase):
    sort_order: int = 0
    # Тип по умолчанию используется, когда в договоре ничего не выбрано.
    is_default: bool = False


class PriceTypeRead(ReferenceRead):
    sort_order: int
    is_default: bool
