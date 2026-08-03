from typing import Any

from fastapi import APIRouter

from app.api.crud_router import build_reference_router
from app.models import (
    Contract,
    Counterparty,
    Division,
    Nomenclature,
    Organization,
    Outlet,
    OutletType,
    ProductCategory,
    UnitOfMeasure,
    Warehouse,
)
from app.schemas import references as s


def _columns(obj: Any) -> dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _nomenclature_payload(obj: Nomenclature) -> dict[str, Any]:
    data = _columns(obj)
    data["category_name"] = obj.category.name if obj.category else None
    data["unit_name"] = obj.base_unit.name if obj.base_unit else None
    return data


def _outlet_payload(obj: Outlet) -> dict[str, Any]:
    data = _columns(obj)
    data["counterparty_name"] = obj.counterparty.name if obj.counterparty else None
    data["outlet_type_name"] = obj.outlet_type.name if obj.outlet_type else None
    data["outlet_type_color"] = obj.outlet_type.color if obj.outlet_type else None
    return data


router = APIRouter()

router.include_router(
    build_reference_router(
        model=Organization,
        write_schema=s.OrganizationWrite,
        read_schema=s.OrganizationRead,
        prefix="/organizations",
        tag="Справочники: организации",
        search_fields=("name", "code", "bin"),
    )
)

router.include_router(
    build_reference_router(
        model=Division,
        write_schema=s.DivisionWrite,
        read_schema=s.DivisionRead,
        prefix="/divisions",
        tag="Справочники: подразделения",
    )
)

router.include_router(
    build_reference_router(
        model=Warehouse,
        write_schema=s.WarehouseWrite,
        read_schema=s.WarehouseRead,
        prefix="/warehouses",
        tag="Справочники: склады",
    )
)

router.include_router(
    build_reference_router(
        model=UnitOfMeasure,
        write_schema=s.UnitOfMeasureWrite,
        read_schema=s.UnitOfMeasureRead,
        prefix="/units",
        tag="Справочники: единицы измерения",
    )
)

router.include_router(
    build_reference_router(
        model=ProductCategory,
        write_schema=s.ProductCategoryWrite,
        read_schema=s.ProductCategoryRead,
        prefix="/product-categories",
        tag="Справочники: номенклатурные группы",
    )
)

router.include_router(
    build_reference_router(
        model=Nomenclature,
        write_schema=s.NomenclatureWrite,
        read_schema=s.NomenclatureRead,
        prefix="/nomenclature",
        tag="Справочники: номенклатура",
        search_fields=("name", "code", "article", "barcode"),
        serializer=_nomenclature_payload,
    )
)

router.include_router(
    build_reference_router(
        model=Counterparty,
        write_schema=s.CounterpartyWrite,
        read_schema=s.CounterpartyRead,
        prefix="/counterparties",
        tag="Справочники: контрагенты",
        search_fields=("name", "code", "bin_iin", "full_name"),
    )
)

router.include_router(
    build_reference_router(
        model=OutletType,
        write_schema=s.OutletTypeWrite,
        read_schema=s.OutletTypeRead,
        prefix="/outlet-types",
        tag="Справочники: типы торговых точек",
    )
)

router.include_router(
    build_reference_router(
        model=Outlet,
        write_schema=s.OutletWrite,
        read_schema=s.OutletRead,
        prefix="/outlets",
        tag="Справочники: торговые точки",
        search_fields=("name", "code", "address"),
        serializer=_outlet_payload,
    )
)

router.include_router(
    build_reference_router(
        model=Contract,
        write_schema=s.ContractWrite,
        read_schema=s.ContractRead,
        prefix="/contracts",
        tag="Справочники: договоры",
        search_fields=("name", "code", "number"),
    )
)
