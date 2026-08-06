"""Витрина продукции на сайте.

Открыта без авторизации: это страница для покупателя, а не для сотрудника.
Наружу отдаём только то, что нужно витрине, — цены и остатки здесь не место.
"""

import contextlib
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbSession, require_roles
from app.models import EDITOR_ROLES, Nomenclature
from app.services.slug import slugify
from app.services.storage import check_readable, save_file

router = APIRouter(prefix="/catalog", tags=["Каталог продукции"])

editor = Depends(require_roles(*EDITOR_ROLES))

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


class ProductRead(BaseModel):
    """Карточка товара для витрины."""

    id: uuid.UUID
    slug: str | None
    name: str
    full_name: str | None
    description: str | None
    composition: str | None
    shelf_life: str | None
    storage: str | None
    pack: str | None
    image_url: str | None
    unit_name: str | None
    category_id: uuid.UUID | None
    category_name: str | None
    translations: dict[str, Any]


class ImageUploaded(BaseModel):
    """Ответ на загрузку фотографии.

    Кроме карточки сообщает, увидит ли фотографию посетитель сайта: попасть в
    хранилище и стать видимой — разные события.
    """

    product: ProductRead
    visible: bool
    detail: str


class CategoryGroup(BaseModel):
    id: uuid.UUID | None
    name: str
    sort_order: int
    products: list[ProductRead]


def _product(item: Nomenclature) -> ProductRead:
    return ProductRead(
        id=item.id,
        slug=item.slug,
        name=item.name,
        full_name=item.full_name,
        description=item.description,
        composition=item.composition,
        shelf_life=item.shelf_life,
        storage=item.storage,
        pack=item.pack,
        image_url=item.image_url,
        unit_name=item.base_unit.name if item.base_unit else None,
        category_id=item.category_id,
        category_name=item.category.name if item.category else None,
        translations=item.translations or {},
    )


@router.get("", response_model=list[CategoryGroup])
def list_catalog(db: DbSession) -> Any:
    """Опубликованные товары, сгруппированные по группам номенклатуры.

    Группировка здесь, а не в браузере: порядок групп задаётся в справочнике, и
    повторять эту логику на клиенте значило бы держать её в двух местах.
    """

    товары = (
        db.execute(
            select(Nomenclature)
            .where(Nomenclature.is_published.is_(True))
            .where(Nomenclature.is_active.is_(True))
            .order_by(Nomenclature.name)
        )
        .unique()
        .scalars()
        .all()
    )

    группы: dict[uuid.UUID | None, CategoryGroup] = {}
    for товар in товары:
        ключ = товар.category_id
        if ключ not in группы:
            группа = товар.category
            группы[ключ] = CategoryGroup(
                id=ключ,
                name=группа.name if группа else "Прочее",
                sort_order=группа.sort_order if группа else 9999,
                products=[],
            )
        группы[ключ].products.append(_product(товар))

    return sorted(группы.values(), key=lambda g: (g.sort_order, g.name))


@router.get("/{slug}", response_model=ProductRead)
def read_product(slug: str, db: DbSession) -> Any:
    """Карточка товара по адресу.

    Принимаем и идентификатор: адрес заводится при загрузке фотографии, а
    открыть карточку товара без фотографии тоже надо.
    """

    условие = Nomenclature.slug == slug
    with contextlib.suppress(ValueError):
        условие = условие | (Nomenclature.id == uuid.UUID(slug))

    item = (
        db.execute(select(Nomenclature).where(условие).where(Nomenclature.is_published.is_(True)))
        .unique()
        .scalar_one_or_none()
    )

    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Товар не найден")

    return _product(item)


@router.post("/{item_id}/image", response_model=ImageUploaded)
def upload_image(
    item_id: uuid.UUID, db: DbSession, file: UploadFile = File(...), _: Any = editor
) -> Any:
    """Фотография товара для витрины."""

    content_type = (file.content_type or "").split(";")[0].strip()
    extension = ALLOWED_IMAGE_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Допустимы файлы JPEG, PNG или WEBP",
        )

    data = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Файл больше 5 МБ"
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Файл пустой")

    item = db.get(Nomenclature, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Товар не найден")

    item.image_url = save_file(data, "products", extension, content_type)
    # Адрес карточки заводим сам: заставлять человека придумывать латиницу
    # незачем, а без адреса товар не откроется отдельной страницей.
    if not item.slug:
        item.slug = _unique_slug(db, item)
    db.commit()
    db.refresh(item)

    видно, причина = check_readable(item.image_url)
    return ImageUploaded(
        product=_product(item),
        visible=видно,
        detail="" if видно else f"Файл загружен, но на сайте не откроется: {причина}",
    )


def _unique_slug(db: DbSession, item: Nomenclature) -> str:
    основа = slugify(item.name) or str(item.id)[:8]
    кандидат, счётчик = основа, 2
    while db.execute(
        select(Nomenclature.id)
        .where(Nomenclature.slug == кандидат)
        .where(Nomenclature.id != item.id)
    ).first():
        кандидат = f"{основа}-{счётчик}"
        счётчик += 1
    return кандидат
