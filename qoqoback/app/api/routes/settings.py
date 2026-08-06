import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.deps import CurrentUser, DbSession, require_roles
from app.core.mail import resolve_config, try_send
from app.core.secrets import encrypt
from app.models import SETTINGS_ID, AppSettings, UserRole
from app.schemas.settings import (
    MailSettingsRead,
    MailSettingsWrite,
    MailTestResult,
    SettingsRead,
    SettingsWrite,
    StorageSettingsRead,
    StorageSettingsWrite,
    StorageTestResult,
)
from app.services import storage
from app.services.storage import save_file

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

    return save_file(data, subdir, extension, content_type)


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


# --- Почта ---------------------------------------------------------------


def _mail_read(settings: AppSettings) -> MailSettingsRead:
    return MailSettingsRead(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user,
        smtp_from=settings.smtp_from,
        smtp_use_tls=settings.smtp_use_tls,
        smtp_use_ssl=settings.smtp_use_ssl,
        password_set=bool(settings.smtp_password_enc),
        configured=resolve_config().configured,
    )


@router.get("/mail", response_model=MailSettingsRead)
def read_mail_settings(db: DbSession, _: Any = admin_only) -> Any:
    """Настройки почты. Только администратору: здесь доступ к ящику компании."""

    return _mail_read(get_or_create_settings(db))


@router.put("/mail", response_model=MailSettingsRead)
def update_mail_settings(payload: MailSettingsWrite, db: DbSession, _: Any = admin_only) -> Any:
    settings = get_or_create_settings(db)

    # Пароль обрабатывается отдельно: обратно он не отдаётся, поэтому с формы
    # приходит пустым, когда его не меняли.
    for field, value in payload.model_dump(exclude={"smtp_password"}).items():
        setattr(settings, field, value)

    if payload.smtp_password:
        settings.smtp_password_enc = encrypt(payload.smtp_password)
    elif not payload.smtp_host:
        # Адрес сервера убрали — незачем держать и пароль от него.
        settings.smtp_password_enc = None

    db.commit()
    db.refresh(settings)
    return _mail_read(settings)


@router.post("/mail/test", response_model=MailTestResult)
def send_test_email(user: CurrentUser, _: Any = admin_only) -> MailTestResult:
    """Отправляет письмо себе.

    Единственный способ убедиться, что настройки верны: почтовые серверы
    отказывают по десятку причин, и увидеть это надо до того, как приглашение
    не дойдёт до нового сотрудника.
    """

    # Возвращаем ответ сервера как есть: «отправить не удалось» не помогает
    # никому, а причин отказа у почты десяток.
    error = try_send(
        to=user.email,
        subject="QoQo — проверка настроек почты",
        text_body=(
            "Это проверочное письмо из системы QoQo.\n\n"
            "Если вы его читаете, настройки почты верны и приглашения "
            "сотрудникам будут доходить."
        ),
    )

    if error is None:
        return MailTestResult(sent=True, detail=f"Письмо отправлено на {user.email}")
    return MailTestResult(sent=False, detail=error)


# --- Хранилище файлов ----------------------------------------------------


def _storage_read(settings: AppSettings) -> StorageSettingsRead:
    return StorageSettingsRead(
        s3_bucket=settings.s3_bucket,
        s3_endpoint_url=settings.s3_endpoint_url,
        s3_region=settings.s3_region,
        s3_access_key=settings.s3_access_key,
        s3_public_url=settings.s3_public_url,
        secret_set=bool(settings.s3_secret_key_enc),
        configured=storage.resolve_config().configured,
    )


@router.get("/storage", response_model=StorageSettingsRead)
def read_storage_settings(db: DbSession, _: Any = admin_only) -> Any:
    """Настройки хранилища. Только администратору: здесь ключи от бакета."""

    return _storage_read(get_or_create_settings(db))


@router.put("/storage", response_model=StorageSettingsRead)
def update_storage_settings(
    payload: StorageSettingsWrite, db: DbSession, _: Any = admin_only
) -> Any:
    settings = get_or_create_settings(db)

    for field, value in payload.model_dump(exclude={"s3_secret_key"}).items():
        setattr(settings, field, value)

    if payload.s3_secret_key:
        settings.s3_secret_key_enc = encrypt(payload.s3_secret_key)
    elif not payload.s3_bucket:
        # Бакет убрали — держать ключ от него незачем.
        settings.s3_secret_key_enc = None

    db.commit()
    db.refresh(settings)
    return _storage_read(settings)


@router.post("/storage/test", response_model=StorageTestResult)
def test_storage(_: Any = admin_only) -> StorageTestResult:
    """Кладёт в бакет пробный файл и сразу убирает его.

    Проверять чтением нельзя: пустой бакет ответит тем же, что и неверный
    ключ, — а нам нужно знать, что запись работает. Именно записи и не хватает,
    когда фотографии товаров молча пропадают.
    """

    config = storage.resolve_config()
    if not config.configured:
        return StorageTestResult(ok=False, detail="Бакет не указан — файлы лягут на диск")

    ключ = f"_probe/{uuid.uuid4().hex}.txt"
    try:
        клиент = storage.client(config)
        клиент.put_object(Bucket=config.bucket, Key=ключ, Body=b"qoqo", ContentType="text/plain")
        клиент.delete_object(Bucket=config.bucket, Key=ключ)
    except Exception as exc:
        return StorageTestResult(ok=False, detail=f"{type(exc).__name__}: {exc}"[:400])

    return StorageTestResult(ok=True, detail=f"Запись и удаление прошли. Файлы: {config.base_url}")
