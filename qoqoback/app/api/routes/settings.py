import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import get_settings as get_app_config
from app.core.deps import DbSession, require_roles
from app.models import SETTINGS_ID, AppSettings, UserRole
from app.schemas.settings import SettingsRead, SettingsWrite

router = APIRouter(prefix="/settings", tags=["Настройки системы"])

admin_only = Depends(require_roles(UserRole.ADMIN))

# Картинки принимаем только в этих форматах: SVG для чёткости, растр — как запасной.
ALLOWED_LOGO_TYPES = {
    "image/svg+xml": ".svg",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
MAX_LOGO_BYTES = 2 * 1024 * 1024


def get_or_create_settings(db: DbSession) -> AppSettings:
    settings = db.get(AppSettings, SETTINGS_ID)
    if settings is None:
        settings = AppSettings(id=SETTINGS_ID)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=SettingsRead)
def read_settings(db: DbSession) -> Any:
    """Публичный эндпоинт — нужен лендингу и экрану входа до авторизации."""

    return get_or_create_settings(db)


@router.put("", response_model=SettingsRead)
def update_settings(payload: SettingsWrite, db: DbSession, _: Any = admin_only) -> Any:
    settings = get_or_create_settings(db)
    for field, value in payload.model_dump().items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings


def save_upload(file: UploadFile, subdir: str) -> str:
    content_type = (file.content_type or "").split(";")[0].strip()
    extension = ALLOWED_LOGO_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Допустимы файлы SVG, PNG, JPEG или WEBP",
        )

    data = file.file.read(MAX_LOGO_BYTES + 1)
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл больше 2 МБ",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Файл пустой")

    media_root = Path(get_app_config().media_root)
    target_dir = media_root / subdir
    target_dir.mkdir(parents=True, exist_ok=True)

    # Имя генерируем сами: пользовательское имя файла в путь не попадает.
    filename = f"{uuid.uuid4().hex}{extension}"
    (target_dir / filename).write_bytes(data)
    return f"/media/{subdir}/{filename}"


@router.post("/logo", response_model=SettingsRead)
def upload_logo(
    db: DbSession,
    file: UploadFile = File(...),
    variant: str = "light",
    _: Any = admin_only,
) -> Any:
    """Загрузка логотипа. variant: light — основной, dark — для тёмной шапки, favicon."""

    if variant not in ("light", "dark", "favicon"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="variant должен быть light, dark или favicon",
        )

    url = save_upload(file, "branding")
    settings = get_or_create_settings(db)

    if variant == "light":
        settings.logo_url = url
    elif variant == "dark":
        settings.logo_dark_url = url
    else:
        settings.favicon_url = url

    db.commit()
    db.refresh(settings)
    return settings


@router.delete("/logo", response_model=SettingsRead)
def reset_logo(db: DbSession, variant: str = "light", _: Any = admin_only) -> Any:
    """Сбрасывает логотип на встроенный во фронтенд."""

    settings = get_or_create_settings(db)
    if variant == "light":
        settings.logo_url = None
    elif variant == "dark":
        settings.logo_dark_url = None
    elif variant == "favicon":
        settings.favicon_url = None
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="variant должен быть light, dark или favicon",
        )

    db.commit()
    db.refresh(settings)
    return settings
